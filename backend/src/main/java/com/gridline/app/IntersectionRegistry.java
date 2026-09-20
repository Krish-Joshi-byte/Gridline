package com.gridline.app;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class IntersectionRegistry {

    // Real intersections in Blacksburg, VA (24060). Coordinates are
    // approximate street-level positions, not surveyed — accurate enough
    // to sit on the actual road network for routing/demo purposes.
    private final List<Intersection> intersections = List.of(
        new Intersection("MAIN-COLLEGE", "Main St & College Ave", 37.22960, -80.41390),
        new Intersection("MAIN-PATRICKHENRY", "N Main St & Patrick Henry Dr", 37.24340, -80.41330),
        new Intersection("PRICESFORK-SOUTHGATE", "Prices Fork Rd & Southgate Dr", 37.22470, -80.43080),
        new Intersection("MAIN-DRAPER", "Main St & Draper Rd", 37.23020, -80.41440),
        new Intersection("MAIN-UNIVERSITYCITY", "S Main St & University City Blvd", 37.21380, -80.41030),
        new Intersection("PATRICKHENRY-TOMSCREEK", "Patrick Henry Dr & Toms Creek Rd", 37.24670, -80.42340)
    );

    // Codes registered at runtime (citizen reports, mainly) that resolve to
    // an exact real point rather than the six fixed intersections above.
    // Kept out of all()/list responses on purpose — these are individual
    // reports, not part of the demo's map furniture.
    private final Map<String, Intersection> dynamic = new ConcurrentHashMap<>();

    // Center of the demo district, used to place the map view.
    public static final double CENTER_LAT = 37.2296;
    public static final double CENTER_LNG = -80.4139;

    public List<Intersection> all() {
        return intersections;
    }

    // Registers (or overwrites) an exact point under a code so a later
    // resolve(code) — e.g. from POST /api/dispatch — routes units to the
    // real spot instead of the hash-scattered fallback point.
    public void register(String code, String name, double lat, double lng) {
        dynamic.put(code.trim().toUpperCase(), new Intersection(code.trim().toUpperCase(), name, lat, lng));
    }

    // Closest of the six known intersections to an arbitrary point — used
    // to give a citizen-reported GPS location a human-readable label. The
    // exact coordinates are still what gets stored/dispatched to; this is
    // just for display.
    public Intersection nearest(double lat, double lng) {
        Intersection best = intersections.get(0);
        double bestDist = Double.MAX_VALUE;
        for (Intersection i : intersections) {
            double d = GeoUtil.haversineKm(lat, lng, i.lat, i.lng);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    // Resolves a code to a known intersection; anything unrecognized gets
    // a deterministic point scattered within a couple miles of downtown so
    // an arbitrary code never breaks the demo.
    public Intersection resolve(String rawCode) {
        String code = rawCode.trim().toUpperCase();
        for (Intersection i : intersections) {
            if (i.code.equals(code)) return i;
        }
        Intersection registered = dynamic.get(code);
        if (registered != null) return registered;

        int hash = 0;
        for (char c : code.toCharArray()) {
            hash = (hash * 31 + c) & 0x7fffffff;
        }
        double dLat = ((hash % 1000) / 1000.0 - 0.5) * 0.05;   // +/- ~2.7 km
        double dLng = (((hash >> 10) % 1000) / 1000.0 - 0.5) * 0.05;
        return new Intersection(code, code, CENTER_LAT + dLat, CENTER_LNG + dLng);
    }
}
