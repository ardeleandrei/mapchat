export interface Room {
  deletedAt?: Date;
  id: string; title: string; creationTitle?: string; color?: string; revision: number;
  creationKey: string; createdBy?: string;
  location: { type: "Point"; coordinates: [number, number] }; createdAt: Date;
}

export interface RoomQuery { bbox?: [number, number, number, number] | undefined; limit: number }

export interface NearbyQuery { longitude: number; latitude: number; radius: number; limit: number }
