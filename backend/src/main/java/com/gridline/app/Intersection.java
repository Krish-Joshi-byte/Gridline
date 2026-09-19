package com.gridline.app;

public class Intersection {
    public final String code;   // short label, e.g. "MAIN-COLLEGE"
    public final String name;   // human-readable, e.g. "Main St & College Ave"
    public final double lat;
    public final double lng;

    public Intersection(String code, String name, double lat, double lng) {
        this.code = code;
        this.name = name;
        this.lat = lat;
        this.lng = lng;
    }
}
