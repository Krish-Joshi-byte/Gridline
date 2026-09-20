package com.gridline.app;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

// A "Server Tool" the ElevenLabs agent can call live, mid-conversation, to
// actually send a unit — not just talk about it. Configure this as a tool
// in the ElevenLabs dashboard (see README) pointing at
// POST /api/elevenlabs/dispatch-tool with a JSON body of
// {"code": "...", "unit_type": "police"|"fire"|"medical"}; the agent decides
// when to call it and what to say back to the caller from the response.
//
// This is also exactly what WebhookController falls back to after a call
// ends if no unit was ever dispatched — so a real call always results in
// someone actually being sent, whether or not the live tool was configured
// or the agent remembered to use it.
@RestController
@RequestMapping("/api/elevenlabs")
public class ElevenLabsDispatchToolController {

    private static final Set<String> VALID_TYPES = Set.of("police", "fire", "medical");

    @Value("${elevenlabs.tool.secret:}")
    private String toolSecret;

    private final AutoDispatchService autoDispatch;

    public ElevenLabsDispatchToolController(AutoDispatchService autoDispatch) {
        this.autoDispatch = autoDispatch;
    }

    @PostMapping("/dispatch-tool")
    public ResponseEntity<?> dispatch(
            @RequestBody ToolRequest req,
            @RequestHeader(value = "x-gridline-tool-secret", required = false) String providedSecret
    ) {
        if (toolSecret != null && !toolSecret.isBlank() && !toolSecret.equals(providedSecret)) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid tool secret"));
        }
        if (req.code == null || req.code.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "code is required"));
        }
        String type = req.unit_type == null ? null : req.unit_type.trim().toLowerCase();
        if (type == null || !VALID_TYPES.contains(type)) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "unit_type must be one of " + VALID_TYPES
            ));
        }

        if (autoDispatch.alreadyHasUnit(req.code)) {
            return ResponseEntity.ok(Map.of(
                "dispatched", false,
                "reason", "a unit is already responding to this call"
            ));
        }

        Optional<AutoDispatchService.Result> result = autoDispatch.dispatchNearestAvailable(req.code, type);
        if (result.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                "dispatched", false,
                "reason", "no available " + type + " unit right now"
            ));
        }

        DispatchDtos.UnitDispatch unit = result.get().unit;
        return ResponseEntity.ok(Map.of(
            "dispatched", true,
            "unitId", unit.unitId,
            "callsign", unit.callsign,
            "etaMinutes", unit.etaMinutes
        ));
    }

    public static class ToolRequest {
        public String code;
        public String unit_type;
    }
}
