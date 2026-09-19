package com.gridline.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

// A unit's standing assignment when it is not on a call.
//
//   PATROL_LOOP    police — continuous preventive patrol around the beat,
//                  pausing at the waypoints flagged with a dwell (stationary
//                  observation / traffic enforcement).
//   POST_ROTATION  EMS — system status management: hold at a post, then move
//                  to the next post on the rotation. Ambulances do not cruise.
//   STATION_COVER  fire — apparatus stays in quarters; it leaves only for
//                  calls, move-ups, or a periodic district familiarization lap.
//
// The waypoints are real intersections. The route between them is resolved
// against the OSM road network at runtime, so units drive real streets.
@JsonIgnoreProperties(ignoreUnknown = true)
public class Beat {
    public String id;
    public String name;
    public String type;   // police | fire | medical
    public String mode;   // PATROL_LOOP | POST_ROTATION | STATION_COVER
    public double speedKph = 32.0;
    public boolean loop = true;
    public String homeStationId;
    public Integer familiarizationEveryMinutes;
    public Integer coverWaypointIndex;
    public List<Waypoint> waypoints = new ArrayList<>();

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Waypoint {
        public String name;
        public double lat;
        public double lng;
        public int dwellSeconds;
    }
}
