export const SCHEMA_VERSION = "2";

export const CREATE_TABLES = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

-- An area is a set of platforms a traveller thinks of as one stop.
CREATE TABLE areas (
  area_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  search_name TEXT NOT NULL,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  departures  INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TABLE stops (
  stop_id  TEXT PRIMARY KEY,
  area_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  platform TEXT NOT NULL,
  lat      REAL NOT NULL,
  lon      REAL NOT NULL
) WITHOUT ROWID;

CREATE TABLE routes (
  route_id   TEXT PRIMARY KEY,
  agency_id  TEXT NOT NULL,
  short_name TEXT NOT NULL,
  long_name  TEXT NOT NULL,
  type       INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE trips (
  trip_id    TEXT PRIMARY KEY,
  route_id   TEXT NOT NULL,
  service_id TEXT NOT NULL,
  headsign   TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE service_dates (
  service_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  PRIMARY KEY (service_id, date)
) WITHOUT ROWID;

-- arr/dep are seconds since the start of the service day and may exceed 86400.
CREATE TABLE stop_times (
  trip_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  stop_id TEXT NOT NULL,
  arr     INTEGER NOT NULL,
  dep     INTEGER NOT NULL,
  pickup  INTEGER NOT NULL,
  dropoff INTEGER NOT NULL,
  PRIMARY KEY (trip_id, seq)
) WITHOUT ROWID;

-- One row per distinct stopping pattern of a route, for the network map. stop_ids and path are
-- JSON arrays; path follows the road ([lat, lon] pairs) or is empty when the feed has no shapes.
CREATE TABLE line_patterns (
  route_id TEXT NOT NULL,
  trips    INTEGER NOT NULL,
  stop_ids TEXT NOT NULL,
  path     TEXT NOT NULL,
  color    TEXT NOT NULL
);
`;

/** Built after the bulk load; creating them up front would slow the inserts down considerably. */
export const CREATE_INDEXES = `
CREATE INDEX stop_times_by_stop ON stop_times (stop_id, dep);
CREATE INDEX stops_by_area ON stops (area_id);
CREATE INDEX stops_by_position ON stops (lat, lon);
CREATE INDEX areas_by_search ON areas (search_name);
`;
