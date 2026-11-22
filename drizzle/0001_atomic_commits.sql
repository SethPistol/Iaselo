CREATE TABLE workspace_write_checks (operation TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
