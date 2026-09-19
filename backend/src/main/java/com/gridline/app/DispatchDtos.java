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
        public String type;
        public double startLat, startLng;
        public double targetLat, targetLng;
        public String targetCode;
        public String targetName;
        public int etaMinutes; // straight-line estimate; frontend refines this against the real road route

        public UnitDispatch(String unitId, String type, double startLat, double startLng,
                             double targetLat, double targetLng, String targetCode, String targetName,
                             int etaMinutes) {
            this.unitId = unitId;
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

    public static class DispatchResult {
        public List<UnitDispatch> dispatched;
        public List<String> errors; // e.g. "P-16 is already on a call"

        public DispatchResult(List<UnitDispatch> dispatched, List<String> errors) {
            this.dispatched = dispatched;
            this.errors = errors;
        }
    }

    public static class ArriveRequest {
        public double lat;
        public double lng;
    }
}
