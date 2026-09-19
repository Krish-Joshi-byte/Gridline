package com.gridline.app;

public class Responder {
    public String id;
    public String type; // medical | fire | police
    public double lat;
    public double lng;
    public boolean busy;

    public Responder(String id, String type, double lat, double lng) {
        this.id = id;
        this.type = type;
        this.lat = lat;
        this.lng = lng;
        this.busy = false;
    }
}
