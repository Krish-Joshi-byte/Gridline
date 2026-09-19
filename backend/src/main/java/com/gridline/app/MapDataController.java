package com.gridline.app;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MapDataController {

    private final IntersectionRegistry intersections;
    private final ResponderStore responders;
    private final StationRegistry stations;
    private final BeatRegistry beats;

    public MapDataController(IntersectionRegistry intersections, ResponderStore responders,
                             StationRegistry stations, BeatRegistry beats) {
        this.intersections = intersections;
        this.responders = responders;
        this.stations = stations;
        this.beats = beats;
    }

    @GetMapping("/intersections")
    public List<Intersection> intersections() {
        return intersections.all();
    }

    @GetMapping("/responders")
    public List<Responder> responders() {
        return responders.all();
    }

    // Police HQ, both fire stations, the rescue squad and the receiving
    // hospital, with the published address each coordinate came from.
    @GetMapping("/stations")
    public Map<String, Object> stations() {
        return Map.of(
            "stations", stations.all(),
            "attribution", stations.attribution() == null ? "" : stations.attribution()
        );
    }

    // Patrol beats, EMS post rotations and fire districts. The client turns the
    // waypoints into real driving routes via OSRM before animating anything.
    @GetMapping("/beats")
    public Map<String, Object> beats() {
        return Map.of(
            "beats", beats.all(),
            "note", beats.note() == null ? "" : beats.note()
        );
    }

    @GetMapping("/map-config")
    public Map<String, Object> mapConfig() {
        return Map.of(
            "centerLat", IntersectionRegistry.CENTER_LAT,
            "centerLng", IntersectionRegistry.CENTER_LNG,
            "cityName", "Blacksburg, VA",
            "zip", "24060"
        );
    }
}
