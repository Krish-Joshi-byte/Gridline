package com.gridline.app;

import java.util.List;

public class DispatchDtos {

    // A dispatcher-initiated dispatch: a call location plus the specific
    // unit IDs the dispatcher chose to send — no auto-assignment.
    public static class DispatchRequest {
        public String code;
        public List<String> unitIds;
    }

    public static class UnitDispatch {
        public String unitId;
        public String callsign;
        public String type;
        public double startLat, startLng;
        public double targetLat, targetLng;
        public String targetCode;
        public String targetName;
        public int etaMinutes; // straight-line estimate; frontend refines this against the real road route

        public UnitDispatch(String unitId, String callsign, String type,
                            double startLat, double startLng,
                            double targetLat, double targetLng, String targetCode, String targetName,
                            int etaMinutes) {
            this.unitId = unitId;
            this.callsign = callsign;
            this.type = type;
            this.startLat = startLat;
            this.startLng = startLng;
            this.targetLat = targetLat;
            this.targetLng = targetLng;
            this.targetCode = targetCode;
            this.targetName = targetName;
            this.etaMinutes = etaMinutes;
        }
    }

    // "While that unit is tied up, move this one over here." Produced by
    // CoverageService and carried out by the client's patrol engine.
    public static class CoverageDirective {
        public String unitId;
        public String action;     // MOVE_UP | COVER_POST
        public String targetId;   // station id or beat id
        public String targetName;
        public double targetLat;
        public double targetLng;
        public String reason;

        public CoverageDirective(String unitId, String action, String targetId, String targetName,
                                 double targetLat, double targetLng, String reason) {
            this.unitId = unitId;
            this.action = action;
            this.targetId = targetId;
            this.targetName = targetName;
            this.targetLat = targetLat;
            this.targetLng = targetLng;
            this.reason = reason;
        }
    }

    public static class DispatchResult {
        public List<UnitDispatch> dispatched;
        public List<String> errors; // e.g. "P-16 is already on a call"
        public List<CoverageDirective> coverage;

        public DispatchResult(List<UnitDispatch> dispatched, List<String> errors, List<CoverageDirective> coverage) {
            this.dispatched = dispatched;
            this.errors = errors;
            this.coverage = coverage;
        }
    }

    public static class ArriveRequest {
        public double lat;
        public double lng;
    }

    public static class ClearRequest {
        public Double lat;
        public Double lng;
    }

    // Heartbeat from the client's patrol simulation.
    public static class PositionUpdate {
        public String unitId;
        public double lat;
        public double lng;
        public String status;
    }

    public static class PositionBatch {
        public List<PositionUpdate> positions;
    }
}
