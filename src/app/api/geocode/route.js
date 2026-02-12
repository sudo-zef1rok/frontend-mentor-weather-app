export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const apiKey = process.env.OWM_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Отсутствует API_KEY" }, { status: 500 });
  }

  if (!query || !query.trim()) {
    return Response.json({ error: "Не указан запрос" }, { status: 400 });
  }

  const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "5");
  url.searchParams.set("appid", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    return Response.json({ error: "Не удалось получить данные" }, { status: 502 });
  }

  const data = await response.json();
  const results = data.map((item) => {
    const parts = [item.name, item.state, item.country].filter(Boolean);
    return {
      name: item.name,
      state: item.state || null,
      country: item.country,
      lat: item.lat,
      lon: item.lon,
      label: parts.join(", "),
    };
  });

  return Response.json(results);
}
