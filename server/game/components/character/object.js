import Promise from 'bluebird';

/**
 * Character class
 */
export default class Character {
    /**
     * Class constructor
     * @param  {Game} Game      The Game object
     * @param  {Object} character The mongoDB character data object
     */
    constructor(Game, character) {
        this.Game = Game;
        // the character objest of the characters who are currently aiming at this character
        this.targetedBy = [];
        // the character object of the current targed character
        this.target = null;
        // holds the faction object of the player
        this.faction = null;
        // holds all the skills for the character
        this.skills = [];
        // Whether their skills and abilities should improve when used
        this.train = true;
        // Whether to ignore quantities on items, like ammo, so they dont run out of ammo etc.
        this.ignoreQuantity = false;
        // holds all the abilities for the character
        // This is set in the object assign, if not set it to blank
        this.abilities = [];
        // create the inventory and equipped objects
        this.inventory = [];
        // list of all active cooldowns for the character
        this.cooldowns = [];
        // if the character is new, they won't have stats, set the default here.
        this.stats = {
            health: 100,
            health_max: 100,
            money: 0,
            bank: 200,
            exp: 0,
            inventorySize: 30,
        };
        // keeps track of all timers
        this.timers = [];

        // assign all the character modifiers, and deep-copy the stats
        Object.assign(this, {
            ...character,
            stats: {
                ...this.stats,
                ...character.stats,
            },
        });

        // if the location does not have an X or Y coordinate, set the location to the
        // map spawn location
        if (!this.location.x || !this.location.y) {
            const spawn = this.Game.mapManager.getSpawn(this.location.map);
            this.location.x = spawn.x;
            this.location.y = spawn.y;
        }

        this.initTimers();

        this.gridLock = this.gridLock.bind(this);
    }

    /**
     * Setup timers related to the character
     */
    initTimers() {
        // run the "garbage collection" every N seconds
        this.timers.push({
            name: 'cooldownGc',
            timer: setInterval(this.Game.cooldownManager.cleanup, 1000, this),
        });
    }

    /**
     * Exports all abilities to a plain object
     * @param  {Boolean} toClient If true, includes the name of the ability as well
     * @return {Object}           The object with ability id as key.
     */
    exportAbilities(toClient = false) {
        const abilities = {};

        this.abilities.map((ability) => {
            if (toClient) {
                abilities[ability.id] = {
                    value: ability.value,
                    name: ability.name,
                };
            } else {
                abilities[ability.id] = ability.value;
            }
        });

        return abilities;
    }

    /**
     * Exports all abilities to a plain object
     * @param  {Boolean} toClient If true, includes the name of the ability as well
     * @return {Object}           The object with ability id as key.
     */
    exportSkills(toClient = false) {
        const exportedSkills = {};

        this.skills.forEach((skill) => {
            if (toClient) {
                exportedSkills[skill.id] = {
                    name: skill.name,
                    modifiers: skill.getModifiers(),
                };
            } else {
                exportedSkills[skill.id] = {
                    id: skill.id,
                    modifiers: skill.getModifiers(),
                };
            }
        });

        return exportedSkills;
    }

    /**
     * generates the grid "room" ID of the characters currect location
     * @return {String}
     */
    getLocationId() {
        return `${this.location.map}_${this.location.y}_${this.location.x}`;
    }

    /**
     * Updates the character location
     * @param  {String} map  Map ID
     * @param  {Number} x   East coordinate
     * @param  {Number} y   North coordinate
     */
    updateLocation(map, x, y) {
        this.location = {
            map: map || this.location.map,
            x,
            y,
        };
    }

    /**
     * sets the character inventory items to list of items passed
     * @param {Array} items array of items references from the itemManager.
     */
    setInventory(items) {
        this.inventory = items;
    }

    /**
     * Export a plain object of the important character data, to be dispatched to the client.
     * @return {Object} Character data
     */
    exportToClient() {
        return {
            user_id: this.user_id,
            name: this.name,
            inventory: this.inventory.map((item) => {
                return item.toObject();
            }),
            stats: this.stats,
            abilities: this.exportAbilities(true),
            faction: this.faction ? this.faction.toObject(true) : null,
            skills: this.exportSkills(true),
            location: this.location,
        };
    }

    /**
     * Sets the target of the character, or NPC, and gridlocks the target (while clearing gridlock on previous target)
     * @param {[type]} target [description]
     */
    setTarget(target) {
        // release the gridlock of the current target, if set
        this.releaseTarget()
            .then(() => {
                // set the new target
                this.target = target;
                // and gridlock them
                this.target.gridLock(this);
            })
            .catch(() => {});
    }

    /**
     * Removes gridlock from target
     * @return {[type]} [description]
     */
    releaseTarget() {
        return new Promise((resolve, reject) => {
            // release the gridlock of the current target, if set
            if (this.target) {
                this.target.gridRelease(this.user_id);
            }

            this.target = null;
            resolve();
        });
    }

    /**
     * Checks if the user is targeted by the user specified
     * @param  {String}  user_id user id
     * @return {Boolean}
     */
    isTargetedBy(user_id) {
        return this.targetedBy.find((user) => user.user_id === user_id) ? true : false;
    }

    /**
     * Adds the user id to the gridlock array
     * @param  {Character Obj} character  the character objest of the character gridlocking the character.
     */
    gridLock(character) {
        if (this.targetedBy.findIndex((obj) => obj.user_id === character.user_id) === -1) {
            this.targetedBy.push(character);
        }
    }

    /**
     * Removes a player from the gridlock, from when they have used /aim
     * @param  {String} user_id User ID
     */
    gridRelease(user_id) {
        const playerIndex = this.targetedBy.findIndex((obj) => obj.user_id === user_id);

        if (playerIndex === -1) {
            return;
        }

        this.targetedBy.splice(playerIndex, 1);
    }

    /**
     * Kill the character
     */
    kill(killer) {
        return this.Game.characterManager.kill(this.user_id, killer);
    }

    /**
     * Kills the character and updates the position to the map spawn position
     * @return {object} Plain object with the items, and cash dropped
     */
    die() {
        return new Promise((resolve, reject) => {
            // release the target from the gridlock/aim
            this.releaseTarget()
                .then(() => {
                     // drop all items and cash
                    const items = this.inventory.splice(0, this.inventory.length);
                    const cash = this.stats.money;
                    const targetedBy = this.targetedBy;

                    // reset the character inventory, money, gridlock etc.
                    this.stats.money = 0;
                    this.targetedBy = [];
                    this.stats.health = this.stats.health_max;

                    const expLost = 0;
                    // if its a player, reduce their exp
                    if (this.user_id) {
                        this.stats.exp * 0.035;
                        this.updateExp(expLost * -1);
                    }

                    // return what is dropped by the character
                    resolve({items, cash, exp: expLost, targetedBy});
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Returns the damage of the equipped ranged weapon + ammo, and reduces durability of ammo.
     * @return {Object}          the damage, -1 if the weapon cannot be fired.
     */
    fireRangedWeapon() {
        return new Promise((resolve, reject) => {
            this.getWeaponDamage('ranged')
                .then((damage) => {
                    if (!this.hasAmmo()) {
                        return reject(0);
                    }

                    if (this.ignoreQuantity) {
                        return resolve(damage);
                    }

                    this.getEquipped('ammo')
                        .then((item) => {
                            // reduce ammo durability
                            item.stats.durability = item.removeDurability(1);

                            // remove ammo if durability is 0
                            if (item.durability <= 0) {
                                this.Game.itemManager.remove(this, item);
                            }

                            resolve(damage);
                        })
                        .catch(() => {
                            reject();
                        });
                })
                .catch(() => {
                    reject();
                });
        });
    }

    /**
     * Checks if the player any any ammo equipped, and if there are any rounds left.
     * @return {Boolean}
     */
    hasAmmo() {
        const equippedAmmo = this.getEquippedSync('ammo');

        if (!equippedAmmo) {
            return false;
        }

        if (equippedAmmo.durability <= 0) {
            return false;
        }

        return true;
    }

    /**
     * Gets the damage bonus of the equipped ammo
     * @return {Promise}
     */
    getAmmoDamage() {
        return new Promise((resolve) => {
            if (!this.hasAmmo()) {
                return resolve(0);
            }

            this.getEquipped('ammo')
                .then((item) => {
                    resolve(item.stats.damage_bonus);
                })
                .catch(() => {
                    reject();
                });
        });
    }

    /**
     * Generates the weapon damage, based on the type equipped.
     * @param  {String} slot     Any of the equipped weapon slots (melee|ranged)
     * @param  {Object} itemList List of all game items
     * @return {Promise}         Damage of the weapon
     */
    getWeaponDamage(slot) {
        return new Promise((resolve, reject) => {
            this.getEquipped(slot)
                .then((equippedItem) => {
                    if (!equippedItem) {
                        return reject();
                    }

                    this.getAmmoDamage()
                        .then((ammoDamage) => {
                            let bonusDamage = 0;

                            if (slot === 'ranged') {
                                bonusDamage = ammoDamage;
                            }

                            resolve(Math.floor(Math.random() * (equippedItem.stats.damage_max - equippedItem.stats.damage_min + 1)) + equippedItem.stats.damage_min + bonusDamage);
                        })
                        .catch(() => {
                            reject();
                        });
                })
                .catch(() => {
                    reject();
                });
        });
    }

    /**
     * Get the items which is equipped in the specified slot
     * @param  {String} slot The equipment slot
     * @return {Promise}
     */
    getEquipped(slot = null) {
        return new Promise((resolve, reject) => {
            // if no slot if specified, return all equipped items
            if (!slot) {
                return resolve(this.getEquippedSync());
            }

            const item = this.getEquippedSync(slot);

            if (!item) {
                return reject();
            }

            resolve(item);
        });
    }

    /**
     * Get the items which is equipped in the specified slot
     * @param  {String}  slot The equipment slot
     * @return {Mixed}        Item if found, null otherwise;
     */
    getEquippedSync(slot) {
        // if no slot if specified, return all equipped items
        if (!slot) {
            return this.inventory.filter((obj) => obj.equipped_slot);
        }

        return this.inventory.find((obj) => obj.equipped_slot === slot);
    }

    /**
     * Unequips slotted item, and adds it to the inventory
     * @param  {String} slot  The equipped slot to unequip
     */
    unEquip(slot) {
        if (!slot) {
            return false;
        }

        this.getEquipped(slot)
            .then((item) => {
                item.equipped_slot = null;
                this.Game.characterManager.updateClient(this.user_id);
            })
            .catch(() => {});
    }

    /**
     * Equips selected item from inventory, moving the other item (if any) to the inventory.
     * @param  {Number} inventoryIndex The inventory array index of the item to equip
     */
    equip(inventoryIndex) {
        const item = this.inventory[inventoryIndex];

        if (!item) {
            return false;
        }

        if (!item.stats.equipable) {
            return false;
        }

        // NOTE: change this line of code, should you wish to update which items can be equipped
        // Check which slot the item will be equipped into
        let slot;
        switch (item.subtype) {
            case 'ranged':
                slot = 'ranged';
                break;

            case 'melee':
                slot = 'melee';
                break;

            case 'body':
                slot = 'armor';
                break;

            case 'ammo':
                slot = 'ammo';
                break;

            default:
                return false;
        }

        this.getEquipped(slot)
            .then((equippedItem) => {
                delete equippedItem.equipped_slot;

                // equip the item
                item.equipped_slot = slot;
                this.Game.characterManager.updateClient(this.user_id);
            })
            .catch(() => {
                // equip the item
                item.equipped_slot = slot;
                this.Game.characterManager.updateClient(this.user_id);
            });
    }

    /**
     * Removes the item (or reduces the number of a given item if stackable) from the character inventory
     * @param  {Number} inventoryIndex      Array index (in the character inventory) of the item to remove
     * @param  {Number} amount              The amount of a given item to remove (only for stackable items)
     * @param  {Object} itemList            The full list of items of the game
     * @return {Object}                     Returns the item removed from the inventory, null if non is found.
     */
    takeItem(inventoryIndex, amount = 1, itemList) {
        let selectedItem = this.inventory[inventoryIndex];
        const item = itemList[selectedItem.id];

        if (!item.stats.stackable) {
            return this.inventory.splice(inventoryIndex, 1)[0];
        }

        // check if they have enough of the specific item to drop
        if (selectedItem.durability < amount) {
            return null;
        }

        const takenItem = {...selectedItem};
        takenItem.durability = amount;

        // if the item (after accounting for the amount to drop), is 0, remove it
        selectedItem.durability = selectedItem.durability - amount;

        if (selectedItem.durability <= 0) {
            this.inventory.splice(inventoryIndex, 1);
        }

        return takenItem;
    }

    /**
     * Selects a random item from the inventory to drop (used primarily for fleeing)
     * @return {Mixed}           Null if no item is found, otherwise an Item Object of the inventory item.
     */
    dropRandomItem() {
        // do we have items in the inventory
        if (!this.inventory.length) {
            return null;
        }

        // pick a random item
        const item = this.inventory[Math.floor(Math.random() * this.inventory.length)];

        if (!item) {
            return null;
        }

        // return the dropped item
        return this.dropItem(item.name.toLowerCase(), 1, true);
    }

    /**
     * Remove the first occurance of a given item from the inventory, based on name.
     * @param  {Mixed}   item      The name or inventory index of the item to drop
     * @param  {Number}  amount    The number of a given item to drop (stackable items only)
     * @param  {Boolean} isFleeing If the drop is caused by fleeing, random the amount dropped, if its a stackable item.
     * @return {Object}            The item (with amount if stackable) which has been removed from the inventory.
     */
    dropItem(item, amount = 1, isFleeing = false) {
        let itemIndex = parseInt(item, 10);
        amount = parseInt(amount, 10);

        if (isNaN(itemIndex) && typeof item === 'string') {
            item = item.toLowerCase();
            // get the first matching items from the inventory
            itemIndex = this.inventory.findIndex((obj) =>obj.name.toLowerCase().indexOf(item) === 0);
        }

        // If no item was found
        if (itemIndex === -1) {
            return null;
        }

        // get the matching item object from the inventory
        let inventoryItem = this.inventory[itemIndex];

        // if they are fleeing, unequip the item
        if (isFleeing && inventoryItem.slot) {
            this.unEquip(inventoryItem.slot);
        }

        // they cannot drop items which are equipped
        if (inventoryItem.slot && !isFleeing) {
            return null;
        }

        // If the item is not stackable, just delete the item from the inventory, can return it
        if (!inventoryItem.stats.stackable) {
            return this.inventory.splice(itemIndex, 1)[0];
        }

        // sanitify check, make sure the durability is a number
        inventoryItem.stats.durability = parseInt(inventoryItem.stats.durability, 10);

        // Check if the character has enough of said item to drop
        if (inventoryItem.stats.durability < amount) {
            return null;
        }

        // if the character drop the item because of fleeing, random the amount, based on what they have
        if (isFleeing) {
            amount = Math.floor(Math.random() * inventoryItem.stats.durability) + 1;
        }

        // if there is not 0 items left, delete the item completely
        if ((inventoryItem.stats.durability - amount) <= 0) {
            return this.inventory.splice(itemIndex, 1)[0];
        }

        // reduce the number of said item, in the inventory
        inventoryItem.removeDurability(amount);

        // return a new item, with the dropped amount
        return this.Game.itemManager.add(inventoryItem.id, {durability: amount});
    }

    /**
     * Gives an item to the character
     * @param  {Item Object} itemObj The item object for the item which will be given to the character
     * @param  {Number} amount       The number of a given item to give to the player (non-stackable as well)
     */
    giveItem(itemObj, amount = null) {
        // check if item is stackable, and if so, see if we have that item in the inventory already
        if (itemObj.stats.stackable) {
            amount = amount || itemObj.stats.durability;

            const inventoryItem = this.inventory.find((obj) => obj.id === itemObj.id);

            if (inventoryItem) {
                inventoryItem.addDurability(amount);
            } else {
                // set the amount of the item to the correct amount, before adding to the inventory
                itemObj.setDurability(amount);
                this.inventory.push(itemObj);
            }
        } else {
            this.inventory.push(itemObj);

            // if we just added one, kill it here.
            if (!amount) {
                return;
            }

            // if its non-stackable, we have to create the item several items.
            for (let i = amount - 1; i > 0; i--) {
                this.giveItem(this.Game.itemManager.add(itemObj.id), 1);
            }
        }
    }

    /**
     * Check if an attack will hit, based on the accuracy ability of the character
     * @return {Bool} True if hit
     */
    attackHit() {
        const acc = this.abilities.find((obj) => obj.id = 'acc');
        return acc.use();
    }

    /**
     * Deal damage to the player
     * @param  {Number}  damage      Amount of damage to deal
     * @param  {Boolean} ignoreArmor Whether armor should reduce the damange
     * @return {Object}              damageBlocked, damageDealt, healthLeft, durabilityLeft, armorRuined.
     */
    dealDamage(damage, ignoreArmor = false) {
        let armor = 0;
        let durability = 0;
        let health = this.stats.health;
        let armorRuined = false;
        const armorItem = this.getEquippedSync('armor');

        if (!ignoreArmor && armorItem) {
            durability = armorItem.durability;
            armor = armorItem.stats.damage_reduction;
        }

        // Either you block the damage dealt if it's lower than your armor/durability combo
        // Or you block whatever you can afford to from either low armor or low durability
        let damageBlocked = Math.min(damage, armor, durability);
        // The damage dealt after the block, but keeping it at 0 if going negative
        let damageDealt = Math.max(0, damage - damageBlocked);
        // New health, but keeping it at 0 if going negative
        let healthLeft = Math.max(0, health - damageDealt);
        // Now full damage as you said, but keeping it at 0 if going negative
        let durabilityLeft = Math.max(0, durability - damage);

        // update the durability of the equipped armor
        if (!ignoreArmor && armorItem) {
            armorItem.durability = durabilityLeft;
        }

        this.stats.health = healthLeft;

        // if the armor durability is 0, remove the item as its broken.
        if (!durabilityLeft && durability) {
            armorRuined = true;
            this.Game.itemManager.remove(this, armor);
        }

        return {
            damageBlocked,
            damageDealt,
            healthLeft,
            durabilityLeft,
            armorRuined,
        };
    }

    /**
     * Add/remove money from the characters cash
     * @param  {Number} amount The amount to add/remove (negative number to remove)
     * @return {Number}        The new cash total
     */
    updateCash(amount) {
        this.stats.money = Math.max(0, Math.round((this.stats.money + amount) * 100) / 100);
        return this.stats.money;
    }

    /**
     * Add/remove money from the characters bank
     * @param  {Number} amount The amount to add/remove (negative number to remove)
     * @return {Number}        The new bank total
     */
    updateBank(amount) {
        this.stats.bank = Math.max(0, Math.round((this.stats.bank + amount) * 100) / 100);
        return this.stats.bank;
    }

    /**
     * Add/remove exp from the character
     * @param  {Number} amount The amount to add/remove (negative number to remove)
     * @return {Number}        The new exp total
     */
    updateExp(amount) {
        this.stats.exp = Math.max(0, Math.round(this.stats.exp + amount));
        return this.stats.exp;
    }

    /**
     * Add/remove health from the character
     * @param  {Number} amount The amount to add/remove (negative number to remove)
     * @return {Number}        The new health total
     */
    updateHealth(amount) {
        let newHealth = Math.max(0, Math.round(this.stats.health + amount));

        // don't allow them to heal above their max
        if (newHealth > this.stats.health_max) {
            newHealth = this.stats.health_max;
        }

        this.stats.health = newHealth;
        return this.stats.health;
    }

    /**
     * Get the amount of space the character has left in its inventory
     * @return {Number}
     */
    inventorySpaceLeft() {
        return this.stats.inventorySize - this.inventory.length;
    }

    /**
     * Checks if the character has room to receive a given item
     * @param  {Item}    item   The item object
     * @param  {Number}  amount The amount of an item to add.
     * @return {Boolean}        True if they have room, false otherwise.
     */
    hasRoomForItem(itemObj, amount = null) {
        // check if item is stackable, and if so, see if we have that item in the inventory already
        if (itemObj.stats.stackable) {
            amount = amount || itemObj.stats.durability;

            const inventoryItem = this.inventory.find((obj) => obj.id === itemObj.id);

            if (!inventoryItem) {
                if (this.inventorySpaceLeft() <= 0) {
                    return false;
                }
            }
        } else {
            amount = amount || 1;

            if (this.inventorySpaceLeft() - amount < 0) {
                return false;
            }
        }

        return true;
    }
}
