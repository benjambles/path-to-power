import Cooldown from './object';

/**
 * Cooldown Manager
 */
export default class CooldownManager {
    /**
     * Class constructor
     * @param  {Game} Game The main Game object
     */
    constructor(Game) {
        this.Game = Game;
        this.cleanup = this.cleanup.bind(this);
    }

    /**
     * Adds a new cooldown to the list
     * @param {String}     action    The unique action/skill identifier
     * @param {Number}     duraction The cooldown duration in seconds
     * @param {character}  character The character object to add the cooldown to.
     * @param {Boolean} autostart Will being the timer when created, instead of manually.
     */
    add(character, action, duraction = null, autostart = false) {
        if (!duraction) {
            // if no duration is specified, load the default from the config (if its not an NPC)
            if (this.Game.config.game.playerCooldowns[action]) {
                duraction = this.Game.config.game.playerCooldowns[action];
            }

            // if no duration is set after the above, just stop it here as the
            // cooldown is poinless without a duration
            if (!duraction) {
                return;
            }
        }

        // create the new cooldown
        const newCooldown = new Cooldown(action, duraction, autostart);
        // add it to the characters cooldown list cooldowns
        character.cooldowns.push(newCooldown);

        return newCooldown;
    }

    /**
     * Finds out how many ticks a cooldown has left, 0 if expired
     * @param  {Character} character The character whos cooldown to check
     * @param  {String}    action    The cooldown key
     * @return {Number}              Number of ticks left in a cooldown
     */
    ticksLeft(character, action) {
        const cooldown = character.cooldowns.find((cd) => cd.action === action && cd.ticks > 0);

        // if there are no timer set, return 0 to aviod locking character from certain actions
        // TODO: Reinitiate timers on server reboot (if any)
        if (!cooldown) {
            return 0;
        }

        if (cooldown.ticks) {
            return Math.max(0, cooldown.ticks);
        }

        return 0;
    }

    /**
     * Removes expired cooldowns from characters
     * @param  {Character} character The character object
     */
    cleanup(character) {
        character.cooldowns = character.cooldowns.filter((obj) => obj.remove);
    }
}
