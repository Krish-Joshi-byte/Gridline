package com.gridline.app;

// CAD-style unit states. AVAILABLE_* states mean the unit can be dispatched;
// EN_ROUTE and ON_SCENE mean it is committed to a call.
public final class UnitStatus {
    public static final String PATROLLING   = "PATROLLING";   // police, moving on its beat
    public static final String POSTED       = "POSTED";       // EMS, holding at a post
    public static final String REPOSITIONING = "REPOSITIONING"; // EMS moving between posts, fire on a familiarization lap
    public static final String IN_QUARTERS  = "IN_QUARTERS";  // fire apparatus at its station
    public static final String COVERING     = "COVERING";     // moved up to cover another unit's district
    public static final String EN_ROUTE     = "EN_ROUTE";     // committed, driving to a call
    public static final String ON_SCENE     = "ON_SCENE";     // committed, working the call
    public static final String RETURNING    = "RETURNING";    // cleared, heading back to beat/quarters

    private UnitStatus() {}

    public static boolean isCommitted(String status) {
        return EN_ROUTE.equals(status) || ON_SCENE.equals(status);
    }
}
