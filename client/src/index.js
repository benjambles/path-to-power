import React from 'react';
import ReactDOM from 'react-dom';
import {Provider} from 'react-redux';
import {createStore, applyMiddleware} from 'redux';
import {BrowserRouter} from 'react-router-dom';

import reducers from './reducers';
import App from './components/app';

// UI
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';

let store;

if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
    // browser redux development tools enabled (does not work on mobile)
    const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
    store = createStore(
        reducers,
        composeEnhancers(
            applyMiddleware()
        )
    );
} else {
    // Production & mobile tests
    const createStoreWithMiddleware = applyMiddleware()(createStore);
    store = createStoreWithMiddleware(reducers);
}

ReactDOM.render(
    <Provider store={store}>
        <BrowserRouter>
            <MuiThemeProvider>
                <App/>
            </MuiThemeProvider>
        </BrowserRouter>
    </Provider>,
    document.querySelector('#root')
);
