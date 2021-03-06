import {STATS_MENU_TOGGLE} from './types';
import {INVENTORY_MENU_TOGGLE} from '../inventory-menu/types';
import {PLAYERS_MENU_TOGGLE} from '../players-menu/types';

const defaultState = {
    open: false,
};

export default function(state = defaultState, action) {
    switch (action.type) {
        case STATS_MENU_TOGGLE:
            return {
                open: !state.open,
            };

        case INVENTORY_MENU_TOGGLE:
        case PLAYERS_MENU_TOGGLE:
            return {
                open: false,
            };
    }

    return state;
}
