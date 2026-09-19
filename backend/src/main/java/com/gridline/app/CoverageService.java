package com.gridline.app;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// Move-up logic. When a station's only engine or a district's medic gets
// committed, real dispatch centres don't leave the hole open — they slide the
// next unit over to cover it. Police are deliberately excluded: beats are
// continuously patrolled, so an adjacent cruiser absorbing a call is normal and
// doesn't trigger a formal move-up.
@Component
public class CoverageService {

    private final StationRegistry stations;
    private final BeatRegistry beats;

    public CoverageService(StationRegistry stations, BeatRegistry beats) {
        this.stations = stations;
        this.beats = beats;
    }

    public List<DispatchDtos.CoverageDirective> planCoverage(List<Responder> committed, List<Responder> fleet) {
        List<DispatchDtos.CoverageDirective> directives = new ArrayList<>();
        Set<String> alreadyDirected = new HashSet<>();

        for (Responder unit : committed) {
            if ("police".equals(unit.type)) continue;

            for (Responder candidate : fleet) {
                if (candidate.id.equals(unit.id)) continue;
                if (!candidate.type.equals(unit.type)) continue;
                if (candidate.isBusy()) continue;
                if (alreadyDirected.contains(candidate.id)) continue;
                if (sameHome(candidate, unit)) continue;

                DispatchDtos.CoverageDirective directive = directiveFor(unit, candidate);
                if (directive == null) continue;

                directives.add(directive);
                alreadyDirected.add(candidate.id);
                break; // one cover unit per committed unit is enough for this fleet size
            }
        }
        return directives;
    }

    private boolean sameHome(Responder a, Responder b) {
        return a.homeStationId != null && a.homeStationId.equals(b.homeStationId) && "fire".equals(a.type);
    }

    // Fire moves up to the vacated station. EMS slides to the post that covers
    // the committed medic's rotation, which is where the coverage gap actually is.
    private DispatchDtos.CoverageDirective directiveFor(Responder committed, Responder cover) {
        if ("fire".equals(committed.type)) {
            Station home = stations.byId(committed.homeStationId).orElse(null);
            if (home == null) return null;
            return new DispatchDtos.CoverageDirective(
                cover.id, "MOVE_UP", home.id, home.name, home.lat, home.lng,
                cover.id + " move up to " + home.name + " covering " + committed.id
            );
        }

        Beat beat = beats.byId(committed.beatId).orElse(null);
        if (beat != null && beat.waypoints != null && !beat.waypoints.isEmpty()) {
            int idx = beat.coverWaypointIndex == null ? 0 : beat.coverWaypointIndex;
            if (idx < 0 || idx >= beat.waypoints.size()) idx = 0;
            Beat.Waypoint post = beat.waypoints.get(idx);
            return new DispatchDtos.CoverageDirective(
                cover.id, "COVER_POST", beat.id, post.name, post.lat, post.lng,
                cover.id + " cover " + post.name + " while " + committed.id + " is committed"
            );
        }

        Station home = stations.byId(committed.homeStationId).orElse(null);
        if (home == null) return null;
        return new DispatchDtos.CoverageDirective(
            cover.id, "MOVE_UP", home.id, home.name, home.lat, home.lng,
            cover.id + " move up to " + home.name + " covering " + committed.id
        );
    }
}
