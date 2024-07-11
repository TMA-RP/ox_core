import { cache, onServerCallback, setVehicleProperties, getVehicleProperties, waitFor, sleep } from '@overextended/ox_lib/client';
import { Vector3 } from '@nativewrappers/fivem';
import { DEBUG } from '../config';

if (DEBUG) import('./parser');

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

	try {
		await waitFor(async () => {
			if (!IsEntityWaitingForWorldCollision(entity)) return true;
		}, 'failed to wait for world collision');
	} catch (e) {
		// console.error(e);
	}
	if (NetworkGetEntityOwner(entity) !== cache.playerId) return;

	SetVehicleOnGroundProperly(entity);
	setTimeout(() => Entity(entity).state.set(key, null, true));
});

function doesfivemworkyet(obj1: any, obj2: any) {
	for (let key in obj1) {
		if (obj1.hasOwnProperty(key)) {
			if (typeof obj1[key] === 'object' && obj1[key] !== null) {
				if (!doesfivemworkyet(obj1[key], obj2[key])) {
					return false;
				}
			} else {
				if (obj2[key] !== obj1[key]) {
					return false;
				}
			}
		}
	}
	return true;
}

AddStateBagChangeHandler('vehicleProperties', '', async (bagName: string, key: string, value: any) => {
	if (!value) return DEBUG && console.info(`removed ${key} state from ${bagName}`);

	const entity = await waitFor(async () => {
		const entity = GetEntityFromStateBagName(bagName);
		DEV: console.info(key, entity);

		if (entity) return entity;
	}, 'failed to get entity from statebag name');

	if (!entity) return;

	// properties and serverside vehicles are one of the most retarded features of fivem
	// let's set this dumb bullshit in an interval and see if they actually bother setting
	let hasBeenCorrectlySet = false;
	let i = 0;
	while (i < 10) {
		i++;
		try {
			setVehicleProperties(entity, value);
		} catch (e) {
			console.error(e);
		}
		const properties = getVehicleProperties(entity);
		if (doesfivemworkyet(value, properties)) {
			hasBeenCorrectlySet = true;
			break;
		}
		await sleep(100);
	}
	if (!hasBeenCorrectlySet) return console.error(`vehicle properties probably didn't fully set properly. thanks fivem.`);
	// Early return to avoid clear state and then consider server side that the vehicle is initialized and rewrite shit data in db
	Entity(entity).state.set(key, null, true);
});

onNet('ox_core:vehicle:enter', async (netId: number) => {
	while (!NetworkDoesEntityExistWithNetworkId(netId)) await sleep(0);
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	while (!DoesEntityExist(vehicle)) await sleep(0);
	TaskWarpPedIntoVehicle(cache.ped, vehicle, -1);
});