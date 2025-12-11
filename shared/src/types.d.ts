export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface InputData {
    seq: number;
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    sprint: boolean;
    sneak: boolean;
    shoot: boolean;
    weapon: number;
    yaw: number;
    pitch: number;
    timestamp: number;
}
export interface PlayerState {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    yaw: number;
    pitch: number;
    health: number;
    weapon: number;
    isShooting: boolean;
    isDead: boolean;
    score: number;
}
export interface HitEvent {
    shooterId: number;
    targetId: number;
    damage: number;
    headshot: boolean;
}
export interface WorldSnapshot {
    tick: number;
    timestamp: number;
    players: PlayerState[];
    hits: HitEvent[];
    lastProcessedInput: number;
}
export declare const ServerMessageType: {
    readonly WELCOME: 1;
    readonly SNAPSHOT: 2;
    readonly PLAYER_JOINED: 3;
    readonly PLAYER_LEFT: 4;
    readonly DEATH: 5;
    readonly RESPAWN: 6;
    readonly GAME_OVER: 7;
};
export declare const ClientMessageType: {
    readonly JOIN: 1;
    readonly INPUT: 2;
    readonly PING: 3;
};
export interface JoinRequest {
    name: string;
}
export interface WelcomeMessage {
    playerId: number;
    tickRate: number;
    mapSeed: number;
}
export declare const GAME_CONSTANTS: {
    readonly TICK_RATE: 60;
    readonly MOVE_SPEED: 5;
    readonly SPRINT_MULTIPLIER: 1.6;
    readonly SNEAK_MULTIPLIER: 0.5;
    readonly JUMP_FORCE: 8;
    readonly GRAVITY: 20;
    readonly PLAYER_HEIGHT: 1.8;
    readonly PLAYER_RADIUS: 0.4;
    readonly HEAD_HEIGHT: 0.3;
    readonly MAX_HEALTH: 100;
    readonly RESPAWN_TIME: 2000;
    readonly INTERPOLATION_BUFFER: 100;
    readonly WEAPONS: readonly [{
        readonly name: "Pistol";
        readonly damage: 25;
        readonly fireRate: 400;
        readonly range: 100;
        readonly spread: 0.02;
        readonly automatic: false;
        readonly bulletCount: 1;
    }, {
        readonly name: "SMG";
        readonly damage: 15;
        readonly fireRate: 100;
        readonly range: 50;
        readonly spread: 0.08;
        readonly automatic: true;
        readonly bulletCount: 1;
    }, {
        readonly name: "Rifle";
        readonly damage: 35;
        readonly fireRate: 150;
        readonly range: 150;
        readonly spread: 0.01;
        readonly automatic: true;
        readonly bulletCount: 1;
    }, {
        readonly name: "Shotgun";
        readonly damage: 15;
        readonly fireRate: 800;
        readonly range: 20;
        readonly spread: 0.15;
        readonly automatic: false;
        readonly bulletCount: 8;
    }];
    readonly MAP_SIZE: 50;
    readonly OBSTACLE_COUNT: 40;
};
export declare const DeathReason: {
    readonly KILLED: 1;
    readonly SUICIDE: 2;
    readonly FELL: 3;
};
