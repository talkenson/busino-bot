import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { clickhouseConfig } from "./config";

export interface EventData {
  event_type?: string;
  project?: string;
  params?: Record<string, string>;
  payload?: any;
  created_at?: Date;
}

export class ClickHouseReporter {
  protected client: ClickHouseClient;
  protected tableName: string;
  protected isEnabled: boolean;
  public readonly project = Bun.env.CLICKHOUSE_PROJECT ?? "fallback";

  constructor(config: {
    host: string;
    username?: string;
    password?: string;
    database?: string;
    tableName?: string;
    enable?: boolean;
  }) {
    this.isEnabled = config.enable ?? true;
    this.tableName = config.tableName || "events";

    if (!this.isEnabled) {
      console.log("ClickHouse reporter is disabled");
      return;
    }

    this.client = createClient({
      url: config.host,
      username: config.username || "default",
      password: config.password || "",
      database: config.database || "default",
      clickhouse_settings: {
        async_insert: 0,
        wait_for_async_insert: 0,
      },
    });
  }

  /**
   * Отправка одного события
   */
  async reportEvent(event: EventData): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await this.client.insert({
        table: this.tableName,
        values: [
          {
            event_type: event.event_type,
            project: this.project,
            params: event.params || {},
            payload: event.payload,
          },
        ],
        format: "JSONEachRow",
      });
    } catch (error) {
      console.error("Failed to report event to ClickHouse:", error);
      // Здесь можно добавить логику повторной попытки или fallback
    }
  }

  /**
   * Пакетная отправка событий
   */
  async reportEvents(events: EventData[]): Promise<void> {
    if (!this.isEnabled || events.length === 0) return;

    try {
      await this.client.insert({
        table: this.tableName,
        values: events.map((event) => ({
          event_type: event.event_type,
          project: this.project,
          params: event.params || {},
          payload: event.payload,
        })),
        format: "JSONEachRow",
      });
    } catch (error) {
      console.error("Failed to report events to ClickHouse:", error);
    }
  }

  /**
   * Создание таблицы (если не существует)
   */
  async createTableIfNotExists(): Promise<void> {
    if (!this.isEnabled) return;

    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        event_id UUID DEFAULT generateUUIDv4(),
        event_type String,
        project String,
        params Map(String, String),
        payload Nullable(String),
        created_at DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY (project, event_type, created_at)
      SETTINGS index_granularity = 8192
    `;

    try {
      await this.client.query({
        query,
        format: "JSON",
      });
      console.log(`Table ${this.tableName} is ready`);
    } catch (error) {
      console.error("Failed to create table:", error);
      throw error;
    }
  }

  /**
   * Проверка соединения
   */
  async checkConnection(): Promise<boolean> {
    if (!this.isEnabled) return true;

    try {
      await this.client.ping();
      return true;
    } catch (error) {
      console.error("ClickHouse connection error:", error);
      return false;
    }
  }

  /**
   * Закрытие соединения
   */
  async close(): Promise<void> {
    if (!this.isEnabled) return;

    await this.client.close();
  }
}

// Пример использования с буферизацией и отправкой по таймеру
export class BufferedClickHouseReporter extends ClickHouseReporter {
  private buffer: EventData[] = [];
  private bufferSize: number;
  private flushInterval: number;
  private flushTimer?: Timer;

  constructor(config: {
    host: string;
    username?: string;
    password?: string;
    database?: string;
    tableName?: string;
    enable?: boolean;
    bufferSize?: number;
    flushIntervalMs?: number;
  }) {
    super(config);
    this.bufferSize = config.bufferSize || 100;
    this.flushInterval = config.flushIntervalMs || 5000;

    if (this.isEnabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Добавление события в буфер
   */
  async bufferEvent(event: EventData): Promise<void> {
    if (!this.isEnabled) return;

    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Синхронное добавление события в буфер
   */
  bufferEventSync(event: EventData): void {
    if (!this.isEnabled) return;

    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      // Асинхронная отправка без ожидания
      this.flushBuffer().catch(console.error);
    }
  }

  /**
   * Очистка буфера
   */
  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const eventsToSend = [...this.buffer];
    this.buffer = [];

    try {
      await this.reportEvents(eventsToSend);
    } catch (error) {
      console.error("Failed to flush buffer, retrying later...");
      // Возвращаем события обратно в буфер для повторной попытки
      this.buffer.unshift(...eventsToSend);
    }
  }

  /**
   * Запуск таймера для периодической отправки
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flushBuffer().catch(console.error);
      }
    }, this.flushInterval);
  }

  /**
   * Остановка репортера
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Отправляем оставшиеся события перед закрытием
    if (this.buffer.length > 0) {
      await this.flushBuffer();
    }

    await this.close();
  }
}

// Пример использования
async function example() {
  // Базовый репортер
  const reporter = new ClickHouseReporter({
    host: "http://localhost:8123",
    username: "default",
    password: "",
    database: "analytics",
    tableName: "events",
  });

  await reporter.checkConnection();
  await reporter.createTableIfNotExists();

  // Отправка события
  await reporter.reportEvent({
    event_type: "user_registered",
    project: "my_project",
    params: {
      source: "web",
      campaign: "spring2024",
    },
    payload: {
      user_id: 12345,
      email: "user@example.com",
      plan: "premium",
    },
  });

  // Репортер с буферизацией
  const bufferedReporter = new BufferedClickHouseReporter({
    host: "http://localhost:8123",
    bufferSize: 50,
    flushIntervalMs: 3000,
  });

  // Буферизованная отправка
  bufferedReporter.bufferEventSync({
    event_type: "page_view",
    project: "my_project",
    params: {
      page: "/home",
      device: "mobile",
    },
  });

  // Остановка буферизованного репортера
  await bufferedReporter.stop();
}

export const chReporter = new BufferedClickHouseReporter({
  ...clickhouseConfig,
  bufferSize: 10,
  flushIntervalMs: 3000,
});

// export const chReporter = new ClickHouseReporter({
//   ...clickhouseConfig,
// });

// Экспорт утилитарной функции для быстрого использования
export async function sendEvent(event: EventData): Promise<void> {
  const reporter = chReporter;

  const resEvent: EventData = {
    event_type: "fallbackEvent",
    params: {},
    payload: {},
    ...event,
  };

  await reporter.reportEvent(resEvent);
}

export async function sendEvents(events: EventData[]): Promise<void> {
  const reporter = chReporter;

  const resEvents: EventData[] = events.map((event) => ({
    event_type: "fallbackEvent",
    params: {},
    payload: {},
    ...event,
  }));

  await reporter.reportEvents(resEvents);
}
