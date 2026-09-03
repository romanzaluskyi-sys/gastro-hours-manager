// @ts-nocheck
// Mały wskaźnik pogody dla wybranego lokalu — miasto ustawiane ręcznie w
// Pracownicy → Lokale (lokale.miasto), patrz utils/weather.ts. Cichy
// fallback na "--°C" przy braku miasta/błędzie sieci — to dekoracja paska,
// nie coś krytycznego, więc nigdy nie pokazujemy błędu użytkownikowi.
import React, { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { fetchCurrentWeather, describeWeatherCode } from "../utils/weather";

export default function WeatherBadge({ city, className = "" }) {
  const [weather, setWeather] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setWeather(null);
    setFailed(false);
    if (!city) return;
    fetchCurrentWeather(city)
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [city]);

  if (!city || failed || !weather) {
    return (
      <span
        className={`flex items-center gap-1 ${className}`}
        title={city ? "Pogoda chwilowo niedostępna" : "Brak miasta dla tego lokalu"}
      >
        <Cloud size={16} /> --°C
      </span>
    );
  }

  const { icon, label } = describeWeatherCode(weather.code);
  return (
    <span className={`flex items-center gap-1 ${className}`} title={`${label}, ${city}`}>
      <span aria-hidden="true">{icon}</span>
      {Math.round(weather.temp)}°C
    </span>
  );
}
