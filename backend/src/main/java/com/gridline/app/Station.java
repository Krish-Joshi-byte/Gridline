package com.gridline.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// A real facility loaded from resources/gridline/stations.json: police HQ,
// fire stations, the rescue squad, the receiving hospital. Everything here
// comes from published public-record addresses; `precision` says whether the
// coordinate was taken from a public listing or is still a street-level
// estimate awaiting a geocode (see tools/geocode-stations.mjs).
@JsonIgnoreProperties(ignoreUnknown = true)
public class Station {
    public String id;
    public String name;
    public String agency;
    public String type;      // police | fire | medical | hospital
    public String address;
    public double lat;
    public double lng;
    public String precision; // listing | approximate | geocoded
    public String source;
}
