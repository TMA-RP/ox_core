import { OxVehicle } from './class';
import { CreateNewVehicle, GetVehicleFromId, IsPlateAvailable, VehicleRow } from './db';
import { GetVehicleData } from '../../common/vehicles';
import { DEBUG } from '../../common/config';

import './class';
import './commands';
import './events';
import { VehicleProperties, sleep } from '@overextended/ox_lib';
import { triggerClientCallback } from '@overextended/ox_lib/server';
import { VectorFromBuffer } from '../../common';

if (DEBUG) import('./parser');

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
	coords?: number | number[] | { x: number; y: number; z: number } | { buffer: any },
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

			// console.log("[ceeb_debug][ox_core] Despawning vehicle with plate in order to respawn it " + vehicle.plate)
			vehicle.despawn(true);
		}
	}

	let networkType: string = vehicleData.type as any;

	/**
	 * Remap vehicle types to their net types.
	 * https://github.com/citizenfx/fivem/commit/1e266a2ca5c04eb96c090de67508a3475d35d6da
	 */

	switch (networkType) {
		case 'bicycle':
			networkType = 'bike';
			break;
		case 'blimp':
			networkType = 'heli';
			break;
		case 'quadbike':
		case 'amphibious_quadbike':
		case 'amphibious_automobile':
		case 'submarinecar':
			networkType = 'automobile';
			break;
	}

	if (typeof coords === 'number') coords = GetEntityCoords(coords);
	else if (typeof coords === 'object' && !Array.isArray(coords)) {
		coords = 'buffer' in coords ? VectorFromBuffer(coords) : [coords.x || 0, coords.y || 0, coords.z || 0];
	}

	const entity = coords
		? CreateVehicleServerSetter(data.model, networkType, coords[0], coords[1], coords[2], heading || 90)
		: 0;

	if (!coords || !DoesEntityExist(entity)) return;
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

	if (plateChanged && data.id) console.log(`[ceeb_debug] Vehicle id [${data.id}] has changed plate from [${oldPlate}] to [${data.plate}]`);

	const metadata = data.data || ({} as { properties: VehicleProperties;[key: string]: any });
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

	if (vehicle.id && !data.stored?.startsWith("property_")) vehicle.setStored(null, false);

	const state = vehicle.getState();
	for (const key in metadata) {
		if (key === 'properties') {
			state.set('vehicleProperties', metadata.properties, true);
		}
		state.set(key, metadata[key], true);
	}
	state.set('vehicleId', vehicle.id, true);
	state.set('initVehicle', true, true);

	return vehicle;
}

export async function SpawnVehicle(id: number, coords: number | number[], heading?: number) {
	const invokingScript = GetInvokingResource();
	const vehicle = await GetVehicleFromId(id);

	if (!vehicle) return;

	vehicle.data = JSON.parse(vehicle.data as any);

	return await CreateVehicle(vehicle, coords, heading, invokingScript);
}

setInterval(async () => {
	for (const key of Object.keys(OxVehicle.getAll())) {
		const vehicle = OxVehicle.get(key);
		if (vehicle && vehicle.entity && DoesEntityExist(vehicle.entity)) {
			const ownerId = NetworkGetEntityOwner(NetworkGetEntityFromNetworkId(vehicle.netId));
			if (ownerId && ownerId !== -1) {
				try {
					const properties = await triggerClientCallback('ceeb_vehicle:getProperties', ownerId, vehicle.netId);
					if (properties) vehicle.set('properties', properties);
				} catch (error) {
					// console.error('Error in triggerClientCallback:', error);
				}
			}
			if (vehicle && vehicle.entity && DoesEntityExist(vehicle.entity)) {
				const coords = GetEntityCoords(vehicle.entity);
				const heading = GetEntityHeading(vehicle.entity);
				vehicle.set('coords', [coords[0], coords[1], coords[2], heading]);
			}
		}
	}
}, 5000);

/**
 * Sets an interval to save every 10 minutes.
 * @todo Consider performance on servers with a high vehicle-count.
 * Multiple staggered saves may improve load.
 */
setInterval(() => OxVehicle.saveAll(undefined, false), 600000);

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

exports('CreateVehicle', CreateVehicle);
exports('SpawnVehicle', SpawnVehicle);
