import { CHARACTER_SLOTS, DEFAULT_SPAWN } from 'config';
import { sleep } from '@overextended/ox_lib';
import {
  cache,
} from '@overextended/ox_lib/client';
import { OxPlayer } from './';
import { netEvent } from 'utils';
import { Character } from 'types';

let playerIsHidden = false;
let camActive = false;

DoScreenFadeOut(0);
NetworkStartSoloTutorialSession();
setTimeout(() => emitNet('ox:playerJoined'));

async function StartSession() {
  if (IsPlayerSwitchInProgress()) {
    StopPlayerSwitch();
  }

  if (GetIsLoadingScreenActive()) {
    SendLoadingScreenMessage('{"fullyLoaded": true}');
    ShutdownLoadingScreenNui();
  }

  NetworkStartSoloTutorialSession();
  DoScreenFadeOut(0);
  ShutdownLoadingScreen();
  SetPlayerControl(cache.playerId, false, 0);
  SetPlayerInvincible(cache.playerId, true);

  while (!OxPlayer.isLoaded || playerIsHidden) {
    DisableAllControlActions(0);
    ThefeedHideThisFrame();
    HideHudAndRadarThisFrame();

    if (playerIsHidden) SetLocalPlayerInvisibleLocally(true);

    await sleep(0);
  }

  NetworkEndTutorialSession();
  SetPlayerControl(cache.playerId, true, 0);
  SetPlayerInvincible(cache.playerId, false);
  SetMaxWantedLevel(0);
  NetworkSetFriendlyFireOption(true);
  SetPlayerHealthRechargeMultiplier(cache.playerId, 0.0);
  emit("ceeb_hud:display", true)
}

async function StartCharacterSelect(characters: Character[]) {
  while (!IsScreenFadedOut()) {
    DoScreenFadeOut(0);
    await sleep(0);
  }

  SetEntityCoordsNoOffset(cache.ped, DEFAULT_SPAWN[0], DEFAULT_SPAWN[1], DEFAULT_SPAWN[2] - 1.0, true, true, false);
  StartPlayerTeleport(
    cache.playerId,
    DEFAULT_SPAWN[0],
    DEFAULT_SPAWN[1],
    DEFAULT_SPAWN[2] - 1.0,
    DEFAULT_SPAWN[3],
    false,
    true,
    false
  );

  while (!UpdatePlayerTeleport(cache.playerId)) await sleep(0);

  camActive = true;
  const cam = CreateCameraWithParams(
    "DEFAULT_SCRIPTED_CAMERA", 
    2151.5132, 
    2921.0088, 
    -60.9020, 
    266.2535, 
    0.00, 
    0.00, 
    40.00, 
    false, 
    0);

  SetCamActive(cam, true);
  RenderScriptCams(true, false, 0, true, true);
  PointCamAtCoord(cam, DEFAULT_SPAWN[0], DEFAULT_SPAWN[1], DEFAULT_SPAWN[2]);
  emit("ceeb_multichar:receiveChars", characters, CHARACTER_SLOTS)

  while (camActive) await sleep(0);

  RenderScriptCams(false, false, 0, true, true);
  DestroyCam(cam, false);
}

async function SpawnPlayer(x: number, y: number, z: number, heading: number) {
  SwitchOutPlayer(cache.ped, 0, 1);

  while (GetPlayerSwitchState() !== 5) await sleep(0);

  SetEntityCoordsNoOffset(cache.ped, x, y, z, false, false, false);
  SetEntityHeading(cache.ped, heading);
  RequestCollisionAtCoord(x, y, z);
  DoScreenFadeIn(200);
  SwitchInPlayer(cache.ped);
  SetGameplayCamRelativeHeading(0);

  while (GetPlayerSwitchState() !== 12) await sleep(0);

  while (!HasCollisionLoadedAroundEntity(cache.ped)) await sleep(0);
}

netEvent('ox:startCharacterSelect', async (_userId: number, characters: Character[]) => {
  if (OxPlayer.isLoaded) {
    DEV: console.info('Character is already loaded - resetting data');
    OxPlayer.isLoaded = false;
    emit('ox:playerLogout');
  }

//   playerIsHidden = true;
  StartSession();
  StartCharacterSelect(characters);

  while (IsScreenFadedOut()) await sleep(0);
});

netEvent('ox:setActiveCharacter', async (character: Character) => {
  if (!character.isNew) {
    DoScreenFadeOut(300);

    while (!IsScreenFadedOut()) await sleep(0);
  }

  camActive = false;
  playerIsHidden = false;
  if (character.x) {
    await SpawnPlayer(character.x || 0, character.y || 0, character.z || 0, character.heading || 0);
  } else {
    RequestCollisionAtCoord(-1044.4243, -2748.9353, 9.7536)
    while (!HasCollisionLoadedAroundEntity(cache.ped)) {
      RequestCollisionAtCoord(-1044.4243, -2748.9353, 9.7536)
      await sleep(0)
    }
    SetEntityCoords(cache.ped, -1044.4243, -2748.9353, 9.7536, true, false, false, false)
    SetEntityHeading(cache.ped, 324.9973)
    await sleep(500)
    FreezeEntityPosition(cache.ped, false)
    SetPlayerInvincible(cache.ped, false)
    NetworkEndTutorialSession()
    TaskGoToCoordAnyMeans(cache.ped, -1030.3773, -2730.0322, 13.7566, 1.0, 0, false, 786603, 0)
    DoScreenFadeIn(1000)
    let pedCoords = GetEntityCoords(cache.ped, false)
    while (GetDistanceBetweenCoords(pedCoords[0], pedCoords[1], pedCoords[2], -1030.3773, -2730.0322, 13.7566, false) > 2.5){
      await sleep(1000)
      pedCoords = GetEntityCoords(cache.ped, false)
    }
    emit("ceeb_hud:switchCinematicMode", false)
    emitNet("ceeb_globals:giveWelcomePack")
  }

  SetEntityHealth(cache.ped, character.health ?? GetEntityMaxHealth(cache.ped));
  SetPedArmour(cache.ped, character.armour ?? 0);

  DEV: console.info(`Loaded as ${character.firstName} ${character.lastName}`);

  OxPlayer.isLoaded = true;
  emit('playerSpawned');
  emit('ox:playerLoaded', OxPlayer, character.isNew);
});
