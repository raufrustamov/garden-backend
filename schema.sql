-- ============================================================
--  Database schema — smart plant watering system (PostgreSQL)
-- ============================================================
create table devices (
                         id          text primary key,
                         name        text not null default 'Garden',
                         last_seen   timestamptz,
                         wifi_rssi   int,
                         created_at  timestamptz not null default now()
);

create table pots (
                      id                 serial primary key,
                      device_id          text not null references devices(id) on delete cascade,
                      slot               int  not null,
                      name               text not null,
                      plant_type         text,
                      moisture_threshold int  not null default 30,
                      enabled            bool not null default true,
                      created_at         timestamptz not null default now(),
                      unique (device_id, slot)
);

create table pot_readings (
                              id           bigserial primary key,
                              pot_id       int not null references pots(id) on delete cascade,
                              ts           timestamptz not null default now(),
                              moisture_pct numeric(5,2) not null,
                              raw_adc      int
);
create index on pot_readings (pot_id, ts desc);

create table ambient_readings (
                                  id           bigserial primary key,
                                  device_id    text not null references devices(id) on delete cascade,
                                  ts           timestamptz not null default now(),
                                  temp_c       numeric(4,1),
                                  humidity     numeric(4,1),
                                  pressure_hpa numeric(6,1),
                                  light_lux    int,
                                  tank_low     bool
);
create index on ambient_readings (device_id, ts desc);

create table watering_events (
                                 id           bigserial primary key,
                                 pot_id       int not null references pots(id) on delete cascade,
                                 ts           timestamptz not null default now(),
                                 trigger      text not null,
                                 duration_sec int
);
create index on watering_events (pot_id, ts desc);

create table commands (
                          id           bigserial primary key,
                          device_id    text not null references devices(id) on delete cascade,
                          type         text not null,
                          pot_slot     int,
                          duration_sec int  default 8,
                          status       text not null default 'pending',
                          created_at   timestamptz not null default now(),
                          executed_at  timestamptz
);
create index on commands (device_id, status);

create table ai_recommendations (
                                    id          bigserial primary key,
                                    device_id   text not null references devices(id) on delete cascade,
                                    created_at  timestamptz not null default now(),
                                    severity    text default 'info',
                                    summary     text not null,
                                    details     jsonb
);
create index on ai_recommendations (device_id, created_at desc);

-- ============================================================
--  Реальные растения (определены по фото, июнь 2026)
-- ============================================================
insert into devices (id, name) values ('greenhouse-01', 'Garden');

insert into pots (device_id, slot, name, plant_type, moisture_threshold) values
                                                                             ('greenhouse-01', 1, 'Роза',      'Rosa sp.',                              40),
                                                                             ('greenhouse-01', 2, 'Мята',      'Mentha sp.',                            45),
                                                                             ('greenhouse-01', 3, 'Любисток',  'Levisticum officinale',                 40),
                                                                             ('greenhouse-01', 4, 'Базилик',   'Ocimum basilicum',                      40),
                                                                             ('greenhouse-01', 5, 'Бархатцы',  'Tagetes patula',                        25),
                                                                             ('greenhouse-01', 6, 'Кинза',     'Coriandrum sativum',                    45),
                                                                             ('greenhouse-01', 7, 'Ежевика',   'Rubus fruticosus',                      40),
                                                                             ('greenhouse-01', 8, 'Потос',     'Epipremnum aureum',                     30),
                                                                             ('greenhouse-01', 9, 'Рейхан',    'Ocimum basilicum var. purpurascens',    40);
