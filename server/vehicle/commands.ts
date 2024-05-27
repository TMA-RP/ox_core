import { addCommand, triggerClientCallback } from '@overextended/ox_lib/server';
import { OxVehicle } from './class';
import { CreateVehicle } from 'vehicle';
import { OxPlayer } from 'player/class';

export function DeleteCurrentVehicle(ped: number) {
  const entity = GetVehiclePedIsIn(ped, false);

  if (!entity) return;

  const vehicle = OxVehicle.get(entity);

  vehicle ? vehicle.setStored('impound', true) : DeleteEntity(entity);
}

addCommand<{ model: string; owner?: number }>(
  'car',
  async (playerId, args, raw) => {
    const ped = playerId && GetPlayerPed(playerId as any);

    if (!ped) return;

    const player = args.owner ? OxPlayer.get(args.owner) : null;
    const plate = await OxVehicle.generatePlate()
    let data: any = {
      model: args.model,
      owner: player?.charId || undefined,
      plate: plate,
    };

    if(!args.owner) {
        data.data = {
            isOpen: true,
            adminCar: true
        }
    }
    
    const vehicle = await CreateVehicle(data, GetEntityCoords(ped), GetEntityHeading(ped));

    if (!vehicle) return;
    if (!args.owner) emit("ceeb_vehicle:key:addTempFromServer", playerId, plate)
    emitNet("ox_core:vehicle:enter", playerId, vehicle.netId)
  },
  {
    help: `Spawn a vehicle with the given model.`,
    params: [
      { name: 'model', paramType: 'string', help: 'The vehicle archetype.' },
      {
        name: 'owner',
        paramType: 'playerId',
        help: "Create a persistent vehicle owned by the target's active character.",
        optional: true,
      },
    ],
    restricted: 'group.admin',
  }
);

addCommand<{ radius?: number; owned?: string }>(
  'dv',
  async (playerId, args, raw) => {
    const ped = GetPlayerPed(playerId as any);

    if (!args.radius) return DeleteCurrentVehicle(ped);

    const vehicles = await triggerClientCallback<number[]>('ox:getNearbyVehicles', playerId, args.radius);

    if (!vehicles) return;

    vehicles.forEach((netId) => {
      const vehicle = OxVehicle.get(NetworkGetEntityFromNetworkId(netId));

      vehicle ? vehicle.setStored('impound', true) : DeleteEntity(vehicle);
    });
  },
  {
    help: `Deletes your current vehicle, or any vehicles within range.`,
    params: [
      { name: 'radius', paramType: 'number', help: 'The radius to despawn vehicles (defaults to 2).', optional: true },
      { name: 'owned', help: 'Include player-owned vehicles.', optional: true },
    ],
    restricted: 'group.admin',
  }
);
