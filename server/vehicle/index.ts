import { OxVehicle } from './class';
import { CreateNewVehicle, GetVehicleFromId, IsPlateAvailable, VehicleRow } from './db';
import { GetVehicleData } from '../../common/vehicles';
import { DEBUG } from '../../common/config';
import './class';
import './commands';
import './events';
import { VehicleProperties, triggerClientCallback, setVehicleProperties } from '@overextended/ox_lib/server';
import { sleep } from '@overextended/ox_lib';
import { Vector3 } from '@nativewrappers/fivem';

if (DEBUG) import('./parser');

type Vec3 = number[] | { x: number; y: number; z: number } | { buffer: any };

export async function CreateVehicle(
	data:
		| string
		| (Partial<VehicleRow> & {
			model: string;
			owner?: number;
			group?: string;
			stored?: string;
			properties?: Partial<VehicleProperties>;
		}),
	coords?: Vec3,
	heading?: number,
	invokingScript = GetInvokingResource()
) {
	if (typeof data === 'string') data = { model: data };

	const vehicleData = GetVehicleData(data.model as string);

	if (!vehicleData)
		throw new Error(
			`Failed to create vehicle '${data.model}' (model is invalid).\nEnsure vehicle exists in '@ox_core/common/data/vehicles.json'`
		);

	if (data.id) {
		const vehicle = OxVehicle.getFromVehicleId(data.id);

		if (vehicle) {
			if (DoesEntityExist(vehicle.entity)) {
				return vehicle;
			}

			vehicle.despawn(true);
		}
	}

	if (coords) coords = Vector3.fromObject(coords);

	const entity = coords ? OxVehicle.spawn(data.model, coords as Vector3, heading || 0) : 0;

	if (!entity || !DoesEntityExist(entity)) return;
	if (!data.vin && (data.owner || data.group)) data.vin = await OxVehicle.generateVin(vehicleData);
	if (data.vin && !data.owner && !data.group) delete data.vin;

	let plateChanged = false;
	let oldPlate = data.plate || "";
	if (!data.plate || !data.id && data.plate && (data.owner || data.group)) {
		if (!data.plate || (await IsPlateAvailable(data.plate))) {
			data.plate = await OxVehicle.generatePlate();
			plateChanged = true;
		}
	}

	if (plateChanged && data.id) console.log(`[ceeb_debug][vehicle_creation] Vehicle id [${data.id}] has changed plate from [${oldPlate}] to [${data.plate}]`);

	const metadata = data.data || ({} as { properties: Partial<VehicleProperties>;[key: string]: any });
	metadata.properties = metadata.properties ? metadata.properties : data.properties ? data.properties : {};
	metadata.properties.plate = plateChanged ? data.plate : metadata.properties.plate ? metadata.properties.plate : data.plate;
	if (!metadata.label) metadata.label = `${vehicleData.name} - ${data.plate}`;

	if (!data.id && data.vin) {
		data.id = await CreateNewVehicle(
			data.plate,
			data.vin,
			data.owner || null,
			data.group || null,
			data.model,
			metadata,
			data.stored || null
		);
	}

	if (!entity) return;

	const vehicle = new OxVehicle(
		entity,
		invokingScript,
		data.plate,
		data.model,
		vehicleData.make,
		data.stored || null,
		metadata,
		data.id,
		data.vin,
		data.owner,
		data.group
	);

	const state = vehicle.getState();
	if (vehicle.id && !data.stored?.startsWith("property_")) vehicle.setStored(null, false);
	state.set('initVehicle', true, true)

	return vehicle;
}

export async function SpawnVehicle(id: number, coords: Vec3, heading?: number) {
	const invokingScript = GetInvokingResource();
	const vehicle = await GetVehicleFromId(id);
	if (!vehicle) return;

	vehicle.data = JSON.parse(vehicle.data as any);

	return await CreateVehicle(vehicle, coords, heading, invokingScript);
}

on('txAdmin:events:serverShuttingDown', () => {
	OxVehicle.saveAll(undefined, true);
});

function GetPlayersInVehicle(vehicle: number) {
	let playersInVehicle: { id: string, seat: number }[] = []
	const onlinePlayers = getPlayers()
	onlinePlayers.forEach((player: string) => {
		const playerPed = GetPlayerPed(player)
		const playerVehicle = GetVehiclePedIsIn(playerPed, false)
		if (playerVehicle === vehicle) {
			for (let seat = -1; seat <= 10; seat++) {
				if (GetPedInVehicleSeat(vehicle, seat) === playerPed) {
					playersInVehicle.push({ id: player, seat: seat })
					break
				}
			}
		}
	})
	return playersInVehicle
}

AddStateBagChangeHandler('', '', async (bagName: string, key: string, value: any) => {
	if (key === "vehicleProperties") return
	const entity = GetEntityFromStateBagName(bagName)
	if (!entity) return
	const vehicle = OxVehicle.get(entity)
	if (!vehicle) return
	if (key === "instance") {
		const players = GetPlayersInVehicle(entity)
		SetEntityRoutingBucket(entity, value)
		while (GetEntityRoutingBucket(entity) !== value) {
			await sleep(0);
		}
		for (const player of players) {
			exports.ceeb_globals.changeInstance(player.id, value)
			while (GetPlayerRoutingBucket(player.id) !== value) {
				await sleep(0);
			}
		}
		for (const player of players) {
			const playerPed = GetPlayerPed(player.id)
			TaskWarpPedIntoVehicle(playerPed, entity, player.seat)
		}
	}
	vehicle.set(key, value)
})

setInterval(async () => {
	for (const key of Object.keys(OxVehicle.getAll())) {
		const vehicle = OxVehicle.get(key);
		if (vehicle && vehicle.id && vehicle.entity && DoesEntityExist(vehicle.entity) && !Entity(vehicle.entity).state["ox_lib:setVehicleProperties"]) {
			const ownerId = NetworkGetEntityOwner(NetworkGetEntityFromNetworkId(vehicle.netId));
			if (ownerId > 0) {
				try {
					const properties: any = await triggerClientCallback('ceeb_vehicle:getProperties', ownerId, vehicle.netId);
					if (properties) {
						const currentProperties = vehicle.get('properties');
						if (properties.plate !== currentProperties.plate) {
							console.log(`[ceeb_debug][saving] Vehicle id [${vehicle.id}] has changed plate from [${currentProperties.plate}] to [${properties.plate}]`)
							if (!Entity(vehicle.entity).state["ox_lib:setVehicleProperties"]) {
								setVehicleProperties(vehicle.entity, currentProperties);
							}
						} else {
							vehicle.set('properties', properties);
						}
					}
				} catch (error) {
					// console.error('Error in triggerClientCallback:', error);
				}
			}
			if (vehicle && vehicle.entity && DoesEntityExist(vehicle.entity) && !Entity(vehicle.entity).state["ox_lib:setVehicleProperties"]) {
				const coords = GetEntityCoords(vehicle.entity);
				const heading = GetEntityHeading(vehicle.entity);
				vehicle.set('coords', [coords[0], coords[1], coords[2], heading]);
			}
		}
	}
}, 5000);

exports('CreateVehicle', CreateVehicle);
exports('SpawnVehicle', SpawnVehicle);