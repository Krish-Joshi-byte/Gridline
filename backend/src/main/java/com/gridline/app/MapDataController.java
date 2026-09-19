package com.gridline.app;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class MapDataController {

    private final IntersectionRegistry intersections;
    private final ResponderStore responders;

    public MapDataController(IntersectionRegistry intersections, ResponderStore responders) {
        this.intersections = intersections;
        this.responders = responders;
    }

    @GetMapping("/intersections")
    public List<Intersection> intersections() {
        return intersections.all();
    }

    @GetMapping("/responders")
    public List<Responder> responders() {
        return responders.all();
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
