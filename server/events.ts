import { OxVehicle } from 'vehicle/class';

on("playerDropped", () => {
    OxVehicle.saveAll(undefined, false);
});
