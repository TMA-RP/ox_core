import { cache, notify, onServerCallback, requestModel } from '@overextended/ox_lib/client';
import { GetTopVehicleStats, GetVehicleData } from '../../common/vehicles';
import { VehicleData, VehicleTypes, VehicleStats, VehicleCategories } from 'types';

onServerCallback('ox:generateVehicleData', async (parseAll: boolean, playerVehicles: any, vehiclePrices: any) => {
  const coords = GetEntityCoords(cache.ped, true);
  const vehicles: Record<string, VehicleData> = {} as any;
  const vehicleModels: string[] = GetAllVehicleModels()
    .map((vehicle: string) => {
      vehicle = vehicle.toLowerCase();

      return parseAll ? vehicle : GetVehicleData(vehicle) ? undefined : vehicle;
    })
    .sort();

  SetPlayerControl(cache.playerId, false, 1 << 8);
  FreezeEntityPosition(cache.ped, true);

  notify({
    title: 'Generating vehicle data',
    description: `${vehicleModels.length} models loaded.`,
    type: 'inform',
  });

  let parsed = 0;

  for (let index = 0; index < vehicleModels.length; index++) {
    const model = vehicleModels[index];
    const hash = await requestModel(model, 5000);

    if (!hash) return;

    const entity = CreateVehicle(hash, coords[0], coords[1], coords[2], 0, false, false);
    let make = GetMakeNameFromVehicleModel(hash);

    if (!make) {
      const make2 = GetMakeNameFromVehicleModel(model.replace(/\W/g, ''));

      if (make2 !== 'CARNOTFOUND') make = make2;
    }

    SetPedIntoVehicle(cache.ped, entity, -1);
    const vehicleClass = exports.ceeb_admincommands.calculateVehicleClass(model, entity);
    let vehicleType: VehicleTypes;

    if (IsThisModelACar(hash)) vehicleType = 'automobile';
    else if (IsThisModelABicycle(hash)) vehicleType = 'bicycle';
    else if (IsThisModelABike(hash)) vehicleType = 'bike';
    else if (IsThisModelABoat(hash)) vehicleType = 'boat';
    else if (IsThisModelAHeli(hash)) vehicleType = 'heli';
    else if (IsThisModelAPlane(hash)) vehicleType = 'plane';
    else if (IsThisModelAQuadbike(hash)) vehicleType = 'quadbike';
    else if (IsThisModelATrain(hash)) vehicleType = 'train';
    else if (vehicleClass === 5) vehicleType = 'submarinecar';
    else if (vehicleClass === 14) vehicleType = 'submarine';
    else if (vehicleClass === 16) vehicleType = 'blimp';
    else vehicleType = 'trailer';

    const stats: VehicleStats = {
      acceleration: parseFloat(GetVehicleModelAcceleration(hash).toFixed(4)),
      braking: parseFloat(GetVehicleModelMaxBraking(hash).toFixed(4)),
      handling: parseFloat(GetVehicleModelEstimatedAgility(hash).toFixed(4)),
      speed: parseFloat(GetVehicleModelEstimatedMaxSpeed(hash).toFixed(4)),
      traction: parseFloat(GetVehicleModelMaxTraction(hash).toFixed(4)),
    };

    const data: VehicleData = {
      isUsedInServer: vehiclePrices[model] ? true : false,
      isPlayerAllowed: playerVehicles[model] ? true : false,
      acceleration: stats.acceleration,
      braking: stats.braking,
      handling: stats.handling,
      speed: stats.speed,
      traction: stats.traction,
      name: GetLabelText(GetDisplayNameFromVehicleModel(hash)),
      make: make ? GetLabelText(make) : '',
      class: vehicleClass,
      seats: GetVehicleModelNumberOfSeats(hash),
      doors: GetNumberOfVehicleDoors(entity),
      type: vehicleType,
      price: 0,
    };

    console.log(index, vehicleModels.length, model, `^3| ${data.make} ${data.name}^0`);

    const weapons = DoesVehicleHaveWeapons(entity);

    if (weapons) data.weapons = true;

    if (vehicleType !== 'trailer' && vehicleType !== 'train') {
      let vehicleCategory: VehicleCategories;

      if (vehicleType === 'heli' || vehicleType === 'plane' || vehicleType === 'blimp') {
        vehicleCategory = 'air';
      } else if (vehicleType === 'boat' || vehicleType === 'submarine') {
        vehicleCategory = 'sea';
      } else if (vehicleType === 'bicycle') {
        vehicleCategory = 'bicycle';
      } else {
        vehicleCategory = 'land';
      }

      const topTypeStats = GetTopVehicleStats(vehicleCategory) || ({} as VehicleStats);

      for (const [key, value] of Object.entries(stats) as [keyof VehicleStats, number][]) {
        if (!topTypeStats[key] || value > topTypeStats[key]) topTypeStats[key] = value;
      }
    }

    let price = vehiclePrices[model] ? vehiclePrices[model] : 0

    if (IsThisModelAnAmphibiousCar(hash)) {
      data.type = 'amphibious_automobile';
    } else if (IsThisModelAnAmphibiousQuadbike(hash)) {
      data.type = 'amphibious_quadbike';
    }

    data.price = Math.floor(price);
    vehicles[model] = data;
    parsed++;

    SetVehicleAsNoLongerNeeded(entity);
    SetModelAsNoLongerNeeded(hash);
    DeleteEntity(entity);
    SetEntityCoordsNoOffset(cache.ped, coords[0], coords[1], coords[2], false, false, false);
  }

  SetPlayerControl(cache.playerId, true, 0);
  FreezeEntityPosition(cache.ped, false);

  notify({
    title: 'Generated vehicle data',
    description: `Generated new data for ${parsed}/${vehicleModels.length} models.`,
    type: 'success',
  });

  return [vehicles, GetTopVehicleStats()];
});
