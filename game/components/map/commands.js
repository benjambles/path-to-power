import { UPDATE_GROUND_ITEMS } from '../item/types';
import { LEFT_GRID, JOINED_GRID } from '../character/types';

function getDirectionName(move) {
    if (move.grid === 'x') {
        return move.direction === 1 ? 'South' : 'North';
    }

    return move.direction === 1 ? 'West' : 'East';
}

function cmdFlee(socket, command, params, Game) {
    let direction = params.join('').trim();
    let moveAction = {grid: '', direction: 0};

    // get the character
    Game.characterManager.get(socket.user.user_id)
        .then(async (character) => {
            const oldLocation = {...character.location};

            // Check if gridlock, if not, ignore command
            if (!character.targetedBy.length) {
                return Game.eventToSocket(socket, 'info', 'No one has taken aim at you, you can move freely.');
            }

            // get their location
            // if no direction is set, choose a random direction
            if (!direction || direction === '') {
                moveAction.grid = Math.floor(Math.random() * 2) ? 'y' : 'x';
                moveAction.direction = Math.floor(Math.random() * 2) ? 1 : -1;
            } else {
                // grap the first letter  from the direction, so we dont need to check for 
                // the fuld name or parts of it.
                switch(direction.charAt(0).toLowerCase()) {
                    case 'n':
                        moveAction.grid = 'y';
                        moveAction.direction = -1;
                        break;
                    case 's':
                        moveAction.grid = 'y';
                        moveAction.direction = 1;
                        break;
                    case 'w':
                        moveAction.grid = 'x';
                        moveAction.direction = -1;
                        break;
                    case 'e':
                        moveAction.grid = 'x';
                        moveAction.direction = 1;
                        break;
                }
            }

            let newLocation = {...character.location};
            // set the location we intend to move the character to
            newLocation[moveAction.grid] = newLocation[moveAction.grid] + moveAction.direction;

            // get the map of the character location
            Game.mapManager.get(character.location.map)
                .then((gameMap) => {
                    // check if the move action is valid
                    if (!gameMap.isValidPostion(newLocation.x, newLocation.y)) {
                        // if not, flip the direction
                        moveAction.direction = (moveAction.direction === 1 ? -1 : 1);
                        // update the new location
                        newLocation = {
                            map: character.location.map,
                            [moveAction.grid]: (character.location[moveAction.grid] + moveAction.direction)
                        }
                    }

                    let groundItems = [];
                    // drop items if they have any
                    if (character.inventory.length) {
                        // drop between 1-3 items
                        const itemsToDrop = Math.floor(Math.random() * 3) + 1;

                        for (var i = itemsToDrop; i >= 0; i--) {
                            let droppedItem = character.dropRandomItem();

                            if (droppedItem) {
                                Game.itemManager.drop(oldLocation.map, oldLocation.x, oldLocation.y, droppedItem);
                            }
                        }

                        groundItems = Game.itemManager.getLocationList(oldLocation.map, oldLocation.x, oldLocation.y, true);
                    }

                    // remove gridlock from the character's target
                    if (character.target) {
                        character.releaseTarget()
                            .then(() => {})
                            .error(Game.logger.error);
                    }

                    // reset the gridlock
                    character.targetedBy = [];

                    // leave the old grid room
                    socket.leave(character.getLocationId());

                    // dispatch leave message to grid
                    Game.eventToRoom(character.getLocationId(), 'info', `${character.name} fled the area, dropping some items as they ran away.`)
                    // remove player from the grid list of players
                    Game.socketManager.dispatchToRoom(character.getLocationId(), {
                        type: LEFT_GRID,
                        payload: character.user_id
                    });

                    if (groundItems.length) {
                        // send the updated items list to the grid
                        Game.socketManager.dispatchToRoom(character.getLocationId(), {
                            type: UPDATE_GROUND_ITEMS,
                            payload: groundItems
                        })
                    }

                    // update character location
                    character.updateLocation(newLocation.map, newLocation.x, newLocation.y);
                    
                    // change location on the map
                    Game.characterManager.changeLocation(character, newLocation, oldLocation);

                    // dispatch join message to new grid
                    Game.eventToRoom(character.getLocationId(), 'info', `${character.name} scrambles in from the ${getDirectionName(moveAction)}`, [character.user_id]);
                    // add player from the grid list of players
                    Game.socketManager.dispatchToRoom(character.getLocationId(), {
                        type: JOINED_GRID,
                        payload: {
                            name: character.name,
                            user_id: character.user_id
                        }
                    });

                    // update the socket room
                    socket.join(character.getLocationId());

                    // update client/socket character and location information
                    Game.characterManager.updateClient(character.user_id);

                    // send the new grid details to the client
                    Game.mapManager.updateClient(character.user_id);
                })
                .catch(Game.logger.error)
        })
        .catch(Game.logger.error);
}

module.exports = [
    {
        commandKeys: [
            '/flee'
        ],
        method: cmdFlee
    }
];