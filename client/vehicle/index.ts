import { cache, onServerCallback, setVehicleProperties, getVehicleProperties, waitFor, sleep } from '@overextended/ox_lib/client';
import { Vector3 } from '@nativewrappers/fivem';
import { DEBUG } from '../config';

if (DEBUG) import('./parser');

function object_equals(x: any, y: any) {
	if (x === y) return true;
	// if both x and y are null or undefined and exactly the same

	if (!(x instanceof Object) || !(y instanceof Object)) return false;
	// if they are not strictly equal, they both need to be Objects

	if (x.constructor !== y.constructor) return false;
	// they must have the exact same prototype chain, the closest we can do is
	// test there constructor.

	for (var p in x) {
		if (!x.hasOwnProperty(p)) continue;
		// other properties were tested using x.constructor === y.constructor

		if (!y.hasOwnProperty(p)) return false;
		// allows to compare x[ p ] and y[ p ] when set to undefined

		if (x[p] === y[p]) continue;
		// if they have the same strict value or identity then they are equal

		if (typeof (x[p]) !== "object") return false;
		// Numbers, Strings, Functions, Booleans must be strictly equal

		if (!object_equals(x[p], y[p])) return false;
		// Objects and Arrays must be tested recursively
	}

	for (p in y)
		if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
			return false;
	// allows x[ p ] to be set to undefined

	return true;
}

onServerCallback('ox:getNearbyVehicles', (radius: number) => {
	const nearbyEntities: number[] = [];
	const playerCoords = Vector3.fromArray(GetEntityCoords(cache.ped, true));

	(GetGamePool('CVehicle') as number[]).forEach((entityId) => {
		const coords = Vector3.fromArray(GetEntityCoords(entityId, true));
		const distance = coords.distance(playerCoords);

		if (distance <= (radius || 2) && NetworkGetEntityIsNetworked(entityId)) nearbyEntities.push(VehToNet(entityId));
	});

	return nearbyEntities;
});

AddStateBagChangeHandler('initVehicle', '', async (bagName: string, key: string, value: any) => {
	if (!value) return;

	const entity = await waitFor(async () => {
		const entity = GetEntityFromStateBagName(bagName);
		DEV: console.info(key, entity);

		if (entity) return entity;
	}, 'failed to get entity from statebag name');

	if (!entity) return;

	await waitFor(async () => {
		if (!IsEntityWaitingForWorldCollision(entity)) return true;
	}, 'failed to wait for world collision');

	if (NetworkGetEntityOwner(entity) !== cache.playerId) return;

	SetVehicleOnGroundProperly(entity);
	setTimeout(() => Entity(entity).state.set(key, null, true));
});

AddStateBagChangeHandler('vehicleProperties', '', async (bagName: string, key: string, value: any) => {
	if (!value) return DEBUG && console.info(`removed ${key} state from ${bagName}`);

	const entity = await waitFor(async () => {
		const entity = GetEntityFromStateBagName(bagName);
		DEV: console.info(key, entity);

		if (entity) return entity;
	}, 'failed to get entity from statebag name');

	if (!entity) return;
	if (setVehicleProperties(entity, value)) {
		const currentProperties: any = getVehicleProperties(entity);
		const changedKeys = []
		for (const key in currentProperties) {
			if (!object_equals(currentProperties[key], value[key])) changedKeys.push(key);
		}
		if (changedKeys.length > 0) return console.warn(`Vehicle with plate ${value.plate} has not been updated properly.`);
		console.warn(`Vehicle with plate ${value.plate} has been updated properly.`);
		setTimeout(() => Entity(entity).state.set(key, null, true));
	}
});

onNet('ox_core:vehicle:enter', async (netId: number) => {
	while (!NetworkDoesEntityExistWithNetworkId(netId)) await sleep(0);
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	while (!DoesEntityExist(vehicle)) await sleep(0);
	TaskWarpPedIntoVehicle(cache.ped, vehicle, -1);
});