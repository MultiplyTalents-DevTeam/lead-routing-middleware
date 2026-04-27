import type { CalendarRoute, ClientConfig, PolygonPoint, RouteDecision } from "../types/domain.js";

interface RouteInput {
  service: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function distanceInMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMi = 3958.8;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMi * c;
}

function pointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    if (!current || !previous) {
      continue;
    }

    const xi = current.lng;
    const yi = current.lat;
    const xj = previous.lng;
    const yj = previous.lat;

    const intersect = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function evaluateArea(route: CalendarRoute, input: RouteInput): { matched: boolean; score: number; reason: string } {
  const area = route.area;

  if (area.mode === "NONE") {
    return { matched: true, score: 10, reason: "No service area restriction" };
  }

  if (area.mode === "ZIP_LIST") {
    if (!input.zip) {
      return { matched: false, score: 0, reason: "Missing ZIP code for ZIP_LIST routing" };
    }

    const zipMatches = area.zipCodes.map(normalize).includes(normalize(input.zip));
    return {
      matched: zipMatches,
      score: zipMatches ? 30 : 0,
      reason: zipMatches ? "ZIP matched route list" : "ZIP did not match route list"
    };
  }

  if (area.mode === "GEOFENCE_MI") {
    if (!area.geofence) {
      return { matched: false, score: 0, reason: "Invalid geofence configuration" };
    }

    if (input.lat === undefined || input.lng === undefined) {
      return { matched: false, score: 0, reason: "Missing lat/lng for geofence routing" };
    }

    const distance = distanceInMiles(input.lat, input.lng, area.geofence.centerLat, area.geofence.centerLng);
    const within = distance <= area.geofence.radiusMi;
    return {
      matched: within,
      score: within ? 40 - Math.min(distance, 10) : 0,
      reason: within ? `Geofence match at ${distance.toFixed(2)} mi` : `Outside geofence by ${(distance - area.geofence.radiusMi).toFixed(2)} mi`
    };
  }

  if (area.mode === "POLYGON") {
    if (input.lat === undefined || input.lng === undefined) {
      return { matched: false, score: 0, reason: "Missing lat/lng for polygon routing" };
    }

    const points = area.polygonPoints;
    if (points.length < 3) {
      return { matched: false, score: 0, reason: "Invalid polygon configuration" };
    }

    const inside = pointInPolygon({ lat: input.lat, lng: input.lng }, points);
    return {
      matched: inside,
      score: inside ? 45 : 0,
      reason: inside ? "Inside polygon area" : "Outside polygon area"
    };
  }

  return { matched: false, score: 0, reason: "Unsupported area mode" };
}

export function resolveRoute(config: ClientConfig, input: RouteInput): RouteDecision {
  const normalizedService = normalize(input.service);

  let best: { route: CalendarRoute; score: number; reason: string } | undefined;

  for (const route of config.calendarRoutes) {
    const services = route.services.map(normalize);
    const serviceMatch = services.includes(normalizedService);

    if (!serviceMatch) {
      continue;
    }

    const areaResult = evaluateArea(route, input);
    if (!areaResult.matched) {
      continue;
    }

    const score = 50 + areaResult.score;
    if (!best || score > best.score) {
      best = {
        route,
        score,
        reason: areaResult.reason
      };
    }
  }

  if (!best) {
    return {
      matched: false,
      reason: "No calendar route matched service + service area"
    };
  }

  return {
    matched: true,
    reason: best.reason,
    calendar: best.route,
    score: best.score
  };
}
