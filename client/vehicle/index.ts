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
		const currentProperties = getVehicleProperties(entity);
		let diff = [];
		for (const [curKey, curValue] of Object.entries(currentProperties)) {
			if (value[curKey] !== curValue) diff.push(curKey);
		}
		if (diff.length > 0) return console.warn(`Failed to set vehicle properties: ${diff.join(', ')}`);
		setTimeout(() => Entity(entity).state.set(key, null, true));
	}
});

onNet('ox_core:vehicle:enter', async (netId: number) => {
	while (!NetworkDoesEntityExistWithNetworkId(netId)) await sleep(0);
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	while (!DoesEntityExist(vehicle)) await sleep(0);
	TaskWarpPedIntoVehicle(cache.ped, vehicle, -1);
});