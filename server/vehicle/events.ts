import { OxVehicle } from './class';

on('onResourceStop', (resource: string) => OxVehicle.saveAll(resource, true));

on('entityRemoved', (entityId: number) => {
	const vehicle = OxVehicle.get(entityId);

	if (!vehicle) return;

	console.log(`[ceeb_debug][OX] Vehicle with ${vehicle.plate}) has received entityRemoved event.`);
	console.log(`#############################################`);
	vehicle.setStored('impound', true);
});
