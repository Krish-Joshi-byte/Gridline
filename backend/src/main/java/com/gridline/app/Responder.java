package com.gridline.app;

// A unit on the board. Position is live: while a unit is on patrol or moving
// between posts the client reports its position back (see
// POST /api/responders/positions), so dispatch always measures from where the
// unit actually is rather than from the station it started the shift at.
public class Responder {
    public String id;
    public String callsign;
    public String type;          // medical | fire | police
    public String agency;
    public String homeStationId;
    public String beatId;
    public double lat;
    public double lng;
    public String status;        // see UnitStatus
    public String assignedCallCode;
    public long updatedAt;

    public Responder(FleetUnit unit, String status, double lat, double lng) {
        this.id = unit.id;
        this.callsign = unit.callsign;
        this.type = unit.type;
        this.agency = unit.agency;
        this.homeStationId = unit.homeStationId;
        this.beatId = unit.beatId;
        this.status = status;
        this.lat = lat;
        this.lng = lng;
        this.updatedAt = System.currentTimeMillis();
    }

    // Kept for the existing frontend contract: a unit is "busy" exactly when it
    // is committed to a call. Patrolling, posted and in-quarters units are all
    // available, which is what makes them dispatchable from the call panel.
    public boolean isBusy() {
        return UnitStatus.isCommitted(status);
    }
}
