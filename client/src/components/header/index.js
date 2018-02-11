import React from 'react';
import {withRouter} from 'react-router-dom';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import config from '../../config';
import loginImage from '../../assets/images/connect_dark.png';

// actions
import {authLogout} from '../auth/actions';

// UI
import {Toolbar, ToolbarGroup, ToolbarTitle} from 'material-ui/Toolbar';
import FlatButton from 'material-ui/FlatButton';
import IconMenu from 'material-ui/IconMenu';
import MenuItem from 'material-ui/MenuItem';
import IconButton from 'material-ui/IconButton';
import MoreVertIcon from 'material-ui/svg-icons/navigation/more-vert';
import Divider from 'material-ui/Divider';

class Header extends React.Component {
    constructor(props) {
        super(props);
    }

    logout() {
        Twitch.logout((error) => {
            localStorage.removeItem('account');
            this.props.authLogout();
            this.props.socket.close();
            this.props.history.push('/');
        });
    }

    renderContent() {
        if (!this.props.isConnected) {
            return <span>Connecting..</span>;
        }

        if (!this.props.character) {
            return <FlatButton
                href={`https://api.twitch.tv/kraken/oauth2/authorize?response_type=token&client_id=${config.twitch.clientId}&redirect_uri=${config.twitch.callbackUrl}&scope=${config.twitch.scope.join(',')}`}
                icon={<img src={loginImage} />}
            />;
        }

        return <IconMenu
            iconButtonElement={<IconButton><MoreVertIcon /></IconButton>}
            anchorOrigin={{horizontal: 'right', vertical: 'top'}}
            targetOrigin={{horizontal: 'right', vertical: 'top'}}
        >
            <MenuItem href="https://github.com/MrEliasen/path-to-power/wiki" primaryText="How To Play" target="_blank"/>
            <MenuItem href="https://github.com/MrEliasen/path-to-power/issues" primaryText="Issues/Feedback" target="_blank"/>
            <Divider />
            <MenuItem onClick={this.logout.bind(this)} primaryText="Log Out" />
        </IconMenu>;
    }

    render() {
        return (
            <Toolbar>
                <ToolbarGroup>
                    <ToolbarTitle text="Path To Power" />
                </ToolbarGroup>
                <ToolbarGroup>
                    {this.renderContent()}
                </ToolbarGroup>
            </Toolbar>
        );
    }
}

function mapStateToProps(state) {
    return {
        gamedata: {...state.game},
        character: state.character ? {...state.character} : null,
        isConnected: state.app.connected,
        socket: state.app.socket,
    };
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators({authLogout}, dispatch);
}

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(Header));
