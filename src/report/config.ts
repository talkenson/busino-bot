function getConnectData(url: string) {
  try {
    // Создаем объект URL для удобного разбора
    const urlObj = new URL(url);

    // Извлекаем данные аутентификации
    const username = urlObj.username || "default";
    const password = urlObj.password || "";

    // Извлекаем хост и порт
    const host = urlObj.hostname || "localhost";
    const port = urlObj.port || "8123";

    // Извлекаем имя базы данных из пути
    // Предполагаем, что БД указана после первого слэша
    const path = urlObj.pathname.substring(1); // Убираем ведущий слэш
    const db = path || "default";

    return {
      host: urlObj.protocol.replace(":", "") + "://" + host + ":" + port,
      port: parseInt(port),
      username: username,
      password: password,
      db: db,
      // Дополнительно можно вернуть полный объект URL
      protocol: urlObj.protocol.replace(":", ""),
    };
  } catch (error) {
    // В случае ошибки разбора URL, возвращаем значения по умолчанию
    console.error("Error parsing URL:", error);
    return {};
  }
}

export const clickhouseConfig = {
  host: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  username: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
  database: process.env.CLICKHOUSE_DB || "analytics",
  tableName: process.env.CLICKHOUSE_TABLE || "events",
  enable: process.env.CLICKHOUSE_ENABLED !== "false",
  ...getConnectData(
    process.env.CLICKHOUSE_CONNECT_URL || "http://localhost:8123",
  ),
};
