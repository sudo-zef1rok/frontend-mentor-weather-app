"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_CITY = "Брянск";

const iconForCode = (code) => {
  if (code.startsWith("01")) return "/assets/images/icon-sunny.webp";
  if (code.startsWith("02")) return "/assets/images/icon-partly-cloudy.webp";
  if (code.startsWith("03") || code.startsWith("04")) return "/assets/images/icon-overcast.webp";
  if (code.startsWith("09")) return "/assets/images/icon-drizzle.webp";
  if (code.startsWith("10")) return "/assets/images/icon-rain.webp";
  if (code.startsWith("11")) return "/assets/images/icon-storm.webp";
  if (code.startsWith("13")) return "/assets/images/icon-snow.webp";
  if (code.startsWith("50")) return "/assets/images/icon-fog.webp";
  return "/assets/images/icon-sunny.webp";
};

const toZonedDate = (dt, tz) => new Date((dt + tz) * 1000);
const dateKey = (date) => date.toISOString().slice(0, 10);

const formatDayLabel = (date) =>
  date.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" });

const formatDayLong = (date) =>
  date.toLocaleDateString("ru-RU", { weekday: "long", timeZone: "UTC" });

const formatDateLong = (date) =>
  date.toLocaleDateString("ru-RU", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const formatTime = (date) =>
  date.toLocaleTimeString("ru-RU", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

const cToF = (value) => (value * 9) / 5 + 32;
const kmhToMph = (value) => value / 1.609;
const mmToIn = (value) => value / 25.4;

const round = (value) => Math.round(value);

const formatTemp = (value, unit) => {
  const temp = unit === "f" ? cToF(value) : value;
  return `${round(temp)}°`;
};

const formatWind = (value, unit) => {
  const wind = unit === "mph" ? kmhToMph(value) : value;
  return `${round(wind)} ${unit === "mph" ? "миль/ч" : "км/ч"}`;
};

const formatPrecip = (value, unit) => {
  const precip = unit === "in" ? mmToIn(value) : value;
  return `${round(precip)} ${unit === "in" ? "дюйм" : "мм"}`;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("idle");
  const [selectedDay, setSelectedDay] = useState(0);
  const [units, setUnits] = useState({ temp: "c", wind: "kmh", precip: "mm" });
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const lastCoords = useRef(null);
  const isImperial = units.temp === "f" && units.wind === "mph" && units.precip === "in";

  const fetchWeather = useCallback(async (lat, lon) => {
    setStatus("loading");
    setDayOpen(false);
    try {
      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      if (!response.ok) {
        throw new Error("Не удалось получить данные погоды");
      }
      const data = await response.json();
      setWeather(data);
      setStatus("idle");
      setSelectedDay(0);
      lastCoords.current = { lat, lon };
    } catch (error) {
      setStatus("error");
    }
  }, []);

  const searchByCity = useCallback(
    async (city) => {
      if (!city.trim()) return;
      setStatus("loading");
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(city)}`);
        if (!response.ok) throw new Error("Не удалось выполнить запрос");
        const data = await response.json();
        if (!data.length) {
          setStatus("no-results");
          return;
        }
        await fetchWeather(data[0].lat, data[0].lon);
      } catch (error) {
        setStatus("error");
      }
    },
    [fetchWeather]
  );

  useEffect(() => {
    searchByCity(DEFAULT_CITY);
  }, [searchByCity]);

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setSuggestions([]);
      setIsSuggesting(false);
      setSuppressSuggestions(false);
      return;
    }

    if (suppressSuggestions) {
      setIsSuggesting(false);
      return;
    }

    setIsSuggesting(true);
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("Не удалось выполнить запрос");
        const data = await response.json();
        if (active) {
          setSuggestions(data);
        }
      } catch (error) {
        if (active) {
          setSuggestions([]);
        }
      } finally {
        if (active) {
          setIsSuggesting(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const { daily, hourlyByKey, metricsByKey } = useMemo(() => {
    if (!weather) {
      const placeholder = Array.from({ length: 7 }, (_, index) => ({
        key: `loading-${index}`,
        date: null,
        label: "--",
        longLabel: "--",
        min: null,
        max: null,
        icon: null,
      }));
      return { daily: placeholder, hourlyByKey: {}, metricsByKey: {} };
    }
    const byDate = new Map();
    const hourly = {};
    const metrics = {};

    weather.forecast.forEach((item) => {
      const zoned = toZonedDate(item.dt, weather.timezone);
      const key = dateKey(zoned);
      if (!byDate.has(key)) {
        byDate.set(key, { temps: [], icons: [], date: zoned });
      }
      byDate.get(key).temps.push(item.temp);
      byDate.get(key).icons.push({ icon: item.icon, hour: zoned.getUTCHours() });

      if (!hourly[key]) hourly[key] = [];
      hourly[key].push({
        time: formatTime(zoned),
        temp: item.temp,
        icon: item.icon,
      });

      if (!metrics[key]) {
        metrics[key] = {
          feels_like: [],
          humidity: [],
          wind_kmh: [],
          precipitation_mm: 0,
        };
      }
      metrics[key].feels_like.push(item.feels_like ?? item.temp ?? 0);
      metrics[key].humidity.push(item.humidity ?? 0);
      metrics[key].wind_kmh.push(item.wind_kmh ?? 0);
      metrics[key].precipitation_mm += item.precipitation_mm ?? 0;
    });

    const dailyArr = Array.from(byDate.entries()).map(([key, data]) => {
      const temps = data.temps;
      const min = Math.min(...temps);
      const max = Math.max(...temps);
      const preferredIcon =
        data.icons.find((icon) => icon.hour === 12)?.icon ?? data.icons[0]?.icon ?? "01d";
      return {
        key,
        date: data.date,
        label: formatDayLabel(data.date),
        longLabel: formatDayLong(data.date),
        min,
        max,
        icon: preferredIcon,
      };
    });

    const padded = [...dailyArr];
    while (padded.length < 7) {
      padded.push({
        key: `empty-${padded.length}`,
        date: null,
        label: "--",
        longLabel: "--",
        min: null,
        max: null,
        icon: null,
      });
    }

    const metricsByKey = {};
    Object.entries(metrics).forEach(([key, values]) => {
      const avg = (arr) => (arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0);
      metricsByKey[key] = {
        feels_like: avg(values.feels_like),
        humidity: avg(values.humidity),
        wind_kmh: avg(values.wind_kmh),
        precipitation_mm: values.precipitation_mm,
      };
    });

    return { daily: padded.slice(0, 7), hourlyByKey: hourly, metricsByKey };
  }, [weather]);

  const selectedKey = daily[selectedDay]?.key;
  const hourly = selectedKey && hourlyByKey[selectedKey] ? hourlyByKey[selectedKey] : [];
  const selectedMetrics =
    selectedKey && metricsByKey[selectedKey]
      ? metricsByKey[selectedKey]
      : weather
        ? weather.current
        : null;
  const selectedDaily = daily[selectedDay] && daily[selectedDay].date ? daily[selectedDay] : null;
  const selectedTemp =
    selectedDaily && selectedDaily.max !== null
      ? selectedDaily.max
      : weather
        ? weather.current.temp
        : null;
  const selectedIcon = selectedDaily?.icon ? selectedDaily.icon : weather?.current.icon;
  const selectedDate = selectedDaily?.date ? selectedDaily.date : weather ? toZonedDate(weather.current.dt, weather.timezone) : null;
  const hourlyPlaceholder = Array.from({ length: 8 }, (_, index) => ({
    time: "--",
    temp: 0,
    icon: "01d",
    key: `loading-hour-${index}`,
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuggestions([]);
    setSuppressSuggestions(true);
    await searchByCity(query);
  };

  const handleSuggestionClick = async (item) => {
    setQuery(item.label);
    setSuggestions([]);
    setSuppressSuggestions(true);
    await fetchWeather(item.lat, item.lon);
  };

  const handleRetry = () => {
    if (lastCoords.current) {
      fetchWeather(lastCoords.current.lat, lastCoords.current.lon);
    } else {
      searchByCity(DEFAULT_CITY);
    }
  };

  const handleSwitchSystem = (system) => {
    if (system === "imperial") {
      setUnits({ temp: "f", wind: "mph", precip: "in" });
    } else {
      setUnits({ temp: "c", wind: "kmh", precip: "mm" });
    }
  };

  const isLoading = status === "loading";
  const isError = status === "error";
  const isNoResults = status === "no-results";

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand__name">Погода сейчас</span>
        </div>

        <div className={`units ${unitsOpen ? "is-open" : ""}`}>
          <button
            className="units__button"
            type="button"
            aria-haspopup="true"
            aria-expanded={unitsOpen}
            onClick={() => setUnitsOpen((open) => !open)}
          >
            <img src="/assets/images/icon-units.svg" alt="" aria-hidden="true" />
            <span>Единицы</span>
            <img className="units__chevron" src="/assets/images/icon-dropdown.svg" alt="" aria-hidden="true" />
          </button>

          <div className="units__panel" role="menu" aria-label="Меню единиц">
            <button
              className="units__toggle"
              type="button"
              onClick={() => handleSwitchSystem(isImperial ? "metric" : "imperial")}
            >
              <span>{isImperial ? "Переключить на метрические" : "Переключить на имперские"}</span>
            </button>

            <div className="units__group">
              <p className="units__label">Температура</p>
              <button
                className={`units__option ${units.temp === "c" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, temp: "c" }))}
              >
                <span>Цельсий (°C)</span>
                {units.temp === "c" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
              <button
                className={`units__option ${units.temp === "f" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, temp: "f" }))}
              >
                <span>Фаренгейт (°F)</span>
                {units.temp === "f" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="units__group">
              <p className="units__label">Скорость ветра</p>
              <button
                className={`units__option ${units.wind === "kmh" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, wind: "kmh" }))}
              >
                <span>км/ч</span>
                {units.wind === "kmh" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
              <button
                className={`units__option ${units.wind === "mph" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, wind: "mph" }))}
              >
                <span>миль/ч</span>
                {units.wind === "mph" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
            </div>

            <div className="units__group">
              <p className="units__label">Осадки</p>
              <button
                className={`units__option ${units.precip === "mm" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, precip: "mm" }))}
              >
                <span>Миллиметры (мм)</span>
                {units.precip === "mm" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
              <button
                className={`units__option ${units.precip === "in" ? "units__option--selected" : ""}`}
                type="button"
                onClick={() => setUnits((prev) => ({ ...prev, precip: "in" }))}
              >
                <span>Дюймы (дюйм)</span>
                {units.precip === "in" && (
                  <img src="/assets/images/icon-checkmark.svg" alt="" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="app">
        <section className="hero" aria-label="Поиск погоды">
          <h1>Какая сегодня погода?</h1>

          <form className="search" action="#" role="search" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="location">
              Поиск места
            </label>
            <div className="search__field">
              <img src="/assets/images/icon-search.svg" alt="" aria-hidden="true" />
              <input
                id="location"
                name="location"
                type="search"
                placeholder="Введите место..."
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSuppressSuggestions(false);
                }}
                onFocus={() => setUnitsOpen(false)}
              />
            </div>
            <button className="button" type="submit">
              Поиск
            </button>

            {isSuggesting && (
              <div className="search__status">
                <img src="/assets/images/icon-loading.svg" alt="" aria-hidden="true" />
                Поиск...
              </div>
            )}

            <div className={`search__suggestions ${suggestions.length ? "is-open" : ""}`} role="listbox">
              {suggestions.map((item) => (
                <button key={`${item.lat}-${item.lon}`} type="button" onClick={() => handleSuggestionClick(item)}>
                  {item.label}
                </button>
              ))}
            </div>
          </form>

          {isNoResults && <div className="search__message">Ничего не найдено!</div>}
        </section>

        {isError ? (
          <section className="state" aria-live="polite">
            <img className="state__icon" src="/assets/images/icon-error.svg" alt="" aria-hidden="true" />
            <h2>Что-то пошло не так</h2>
            <p>Не удалось подключиться к серверу (ошибка API). Попробуйте снова позже.</p>
            <button className="state__retry" type="button" onClick={handleRetry}>
              <img src="/assets/images/icon-retry.svg" alt="" aria-hidden="true" />
              Повторить
            </button>
          </section>
        ) : (
          <section className="content">
            <div className="left">
              <article className={`today-card ${isLoading ? "skeleton" : ""}`}>
                <div className="today-card__info">
                  <p className="today-card__location">
                    {weather ? weather.location.label : "Загрузка..."}
                  </p>
                  <p className="today-card__date">
                    {selectedDate ? formatDateLong(selectedDate) : "Загрузка..."}
                  </p>
                </div>
                <div className="today-card__temp">
                  <img
                    src={selectedIcon ? iconForCode(selectedIcon) : "/assets/images/icon-sunny.webp"}
                    alt={weather ? weather.current.description : "Иконка погоды"}
                  />
                  <span>{selectedTemp !== null ? formatTemp(selectedTemp, units.temp) : "--"}</span>
                </div>
              </article>

              <div className="metrics" aria-label="Текущие условия">
                <article className={`metric ${isLoading ? "skeleton" : ""}`}>
                  <p className="metric__label">Ощущается как</p>
                  <p className="metric__value">
                    {selectedMetrics ? formatTemp(selectedMetrics.feels_like, units.temp) : "--"}
                  </p>
                </article>
                <article className={`metric ${isLoading ? "skeleton" : ""}`}>
                  <p className="metric__label">Влажность</p>
                  <p className="metric__value">
                    {selectedMetrics ? `${Math.round(selectedMetrics.humidity)}%` : "--"}
                  </p>
                </article>
                <article className={`metric ${isLoading ? "skeleton" : ""}`}>
                  <p className="metric__label">Ветер</p>
                  <p className="metric__value">
                    {selectedMetrics ? formatWind(selectedMetrics.wind_kmh, units.wind) : "--"}
                  </p>
                </article>
                <article className={`metric ${isLoading ? "skeleton" : ""}`}>
                  <p className="metric__label">Осадки</p>
                  <p className="metric__value">
                    {selectedMetrics ? formatPrecip(selectedMetrics.precipitation_mm, units.precip) : "--"}
                  </p>
                </article>
              </div>

              <section className="daily">
                <div className="section-title">Прогноз по дням</div>
                <div className="daily__grid">
                  {daily.map((day, index) => (
                    <article
                      className={`day-card ${index === selectedDay ? "is-active" : ""} ${isLoading ? "skeleton" : ""}`}
                      key={day.key}
                      data-empty={day.date ? "false" : "true"}
                      onClick={() => {
                        if (day.date) {
                          setSelectedDay(index);
                        }
                      }}
                    >
                      <p className="day-card__day">{day.label}</p>
                      {day.icon ? (
                        <img src={iconForCode(day.icon)} alt="" aria-hidden="true" />
                      ) : (
                        <img src="/assets/images/icon-overcast.webp" alt="" aria-hidden="true" />
                      )}
                      <p className="day-card__temps">
                        <span>{day.max !== null ? formatTemp(day.max, units.temp) : "--"}</span>
                        <span>{day.min !== null ? formatTemp(day.min, units.temp) : "--"}</span>
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="right">
              <section className="hourly">
                <div className="hourly__head">
                  <div className="section-title">Почасовой прогноз</div>
                  <div className="hourly__day">
                    <button
                      className={`hourly__toggle ${dayOpen ? "is-open" : ""}`}
                      type="button"
                      onClick={() => setDayOpen((open) => !open)}
                    >
                      {daily[selectedDay]?.longLabel ?? "День"}
                      <img src="/assets/images/icon-dropdown.svg" alt="" aria-hidden="true" />
                    </button>
                    <div className={`hourly__menu ${dayOpen ? "is-open" : ""}`}>
                      {daily.map((day, index) => (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            if (day.date) {
                              setSelectedDay(index);
                              setDayOpen(false);
                            }
                          }}
                        >
                          {day.longLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="hourly__list">
                  {(isLoading ? hourlyPlaceholder : hourly).map((item, index) => (
                    <article className={`hour-card ${isLoading ? "skeleton" : ""}`} key={item.key ?? `${item.time}-${index}`}>
                      <div className="hour-card__time">
                        <img src={iconForCode(item.icon)} alt="" aria-hidden="true" />
                        <span>{item.time}</span>
                      </div>
                      <span className="hour-card__temp">
                        {isLoading ? "--" : formatTemp(item.temp, units.temp)}
                      </span>
                    </article>
                  ))}
                  {!hourly.length && <div className="search__message">Пока нет данных по часам.</div>}
                </div>
              </section>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}
