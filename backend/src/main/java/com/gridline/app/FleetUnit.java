package com.gridline.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// Roster entry from resources/gridline/fleet.json.
@JsonIgnoreProperties(ignoreUnknown = true)
public class FleetUnit {
    public String id;
    public String callsign;
    public String type;   // police | fire | medical
    public String agency;
    public String homeStationId;
    public String beatId;
}
