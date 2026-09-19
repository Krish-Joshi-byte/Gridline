package com.gridline.app;

public class DispatchDtos {

    public static class DispatchRequest {
        public String code;
        public String type;
    }

    public static class DispatchResponse {
        public String unitId;
        public String type;
        public double startLat, startLng;
        public double targetLat, targetLng;
        public String targetCode;
        public String targetName;
        public int etaMinutes; // straight-line estimate; frontend refines this against the real road route

        public DispatchResponse(String unitId, String type, double startLat, double startLng,
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

    public static class ArriveRequest {
        public double lat;
        public double lng;
    }
}
