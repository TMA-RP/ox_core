import { cache, onServerCallback, setVehicleProperties, sleep } from '@overextended/ox_lib/client';
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
	const netId = parseInt(bagName.split(':')[1]);
	if (!NetworkDoesEntityExistWithNetworkId(netId)) return;
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	SetVehicleOnGroundProperly(vehicle);
	setTimeout(() => Entity(vehicle).state.set(key, null, true));
});

AddStateBagChangeHandler('vehicleProperties', '', async (bagName: string, key: string, value: any) => {
	if (!value) return;
	const netId = parseInt(bagName.split(':')[1]);
	if (!NetworkDoesEntityExistWithNetworkId(netId)) return;
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	if (setVehicleProperties(vehicle, value)) Entity(vehicle).state.set(key, null, true);
});

onNet('ox_core:vehicle:enter', async (netId: number) => {
	while (!NetworkDoesEntityExistWithNetworkId(netId)) await sleep(0);
	const vehicle = NetworkGetEntityFromNetworkId(netId);
	while (!DoesEntityExist(vehicle)) await sleep(0);
	TaskWarpPedIntoVehicle(cache.ped, vehicle, -1);
});