const createElement = React.createElement;
const env = {
    createElement: React.createElement,
    createClass: React.createClass,
    connect: ReactRedux.connect,
    Util: Util
}

const defaultLayout = {
    cols: ['300px','calc(100% - 300px)'],
    rows: ['40px','50%'],
    cells: {
        'title': [1,0,2,1],
        'hosted': [0,1,1,2],
        'technical': [1,1,2,2],
        'config': [2,0,3,1]
    }
}

const defaultConfig = [{
    url: 'plugins/youtube/youtube.js',
    cell: 'hosted',
    pluginConfig: {'youtube id': 'xsZSXav4wI8'}
},{
    url: 'plugins/youtube/youtube.js',
    cell: 'technical',
    pluginConfig: {'youtube id': 'xfNO571C7Ko'}
},{
    url: 'plugins/config/config.js',
    cell: 'config',
    pluginConfig: {}
},{
    url: 'plugins/html/html.js',
    cell: 'title',
    pluginConfig: {
        html: '<h1>Mission Control</h1>'
    }
}];

const initialState = {
    layout: {},
    config: []
};

const cellBox = (name, {cols, rows, cells}) => {
    let left = [].concat('0px', cols, '100%')[cells[name][0]];
    let top = [].concat('0px', rows, '100%')[cells[name][1]];
    let right = [].concat('0px', cols, '100%')[cells[name][2]];
    let bottom = [].concat('0px', rows, '100%')[cells[name][3]];
    return {
        left, top,
        width: `calc(${right} - ${left})`,
        height: `calc(${bottom} - ${top})`
    }
}

const MainView = ({children, className}) => {
    return createElement('div', {className}, children);
}

/**
 * wraps dispatch to dispatch actions under a namespace the plugin id namespace
 */
const wrapDispatch = (dispatch, {pluginId}) => ({
    dispatch: ({type, payload}) => dispatch({
        type: pluginId+type,
        payload
    })
});

const Cell = env.connect(
    state => ({layout: state.layout})
)(
    ({layout, pluginSpec, userConfig}) => {
        let box = cellBox(userConfig.cell, layout);
        let mapState = pluginSpec.mapState;// || (state, {pluginId}) => ({state: state[pluginId]});
        let mapDispatch = pluginSpec.mapDispatch || wrapDispatch;
        let pluginComponent = env.connect(mapState, mapDispatch)(pluginSpec.view);
        return createElement('div', {
            className: 'layout-cell',
            style: box
        }, createElement(pluginComponent, {
            config: Util.spread(pluginSpec.config, userConfig.pluginConfig),
            pluginId: pluginSpec.pluginId,
            box
        }));
    }
);

const layoutReducer = (state, action) => {
    switch (action.type) {
        case 'core/adjustRow':
            return Util.spread(state, {rows: [].concat(
                state.rows.slice(0, action.payload.index),
                action.payload.pos,
                state.rows.slice(action.payload.index+1)
            )});
        case 'core/adjustColumn':
            return Util.spread(state, {cols: [].concat(
                state.cols.slice(0, action.payload.index),
                action.payload.pos,
                state.cols.slice(action.payload.index+1)
            )});
    }
}

const mainReducer = (state = initialState, action) => {
    switch (action.type) {
        case 'core/amendConfig':
            return Util.spread(state, {config: action.payload});
        case 'core/adjustRow':
        case 'core/adjustColumn':
            return Util.spread(state, {layout: layoutReducer(state.layout, action)});
        case 'core/setLayout':
            return Util.spread(state, {layout: action.payload});
        default:
            return state;
    }
}

function initialize() {
    let config = Util.loadFromStorage('config', defaultConfig);
    let layout = Util.loadFromStorage('layout', defaultLayout);
    let loadSrc = cfg => Util.loadScript(cfg.url).then(() => cfg);


    //load the plugins
    Promise.all(Util.fmap(loadSrc, config)).then((res) => {
        console.log('loaded', res);
        let specsIndex = pluginHost.initAll(env);
        console.log(specsIndex);
        let specs = Object.keys(specsIndex).map(url => specsIndex[url]);

        //load css
        specs.filter(spec => spec.style).map(spec => spec.style).forEach(Util.loadCss);

        // let namespacedReducer = (pluginId, reducer) => ()

        let pluginsReducer = (state, action) => {
            return specs.reduce((state, spec) => {
                if (spec.reducer) {
                    return Util.spread(state, {
                        [spec.pluginId]: spec.reducer(state[spec.pluginId], {
                            type: action.type.replace(spec.pluginId, ''),
                            payload: action.payload
                        })
                    });
                } else {
                    return state;
                }
            }, state);
        }

        //create the store
        let store = Redux.createStore(
            Util.pipeReducers(mainReducer, pluginsReducer),
            {layout, config},
            Redux.applyMiddleware(
                middleware.logger,
                middleware.watcher({
                    layout: (newState) => {
                        Util.writeToStorage('layout', newState);
                    }
                })
            )
        );

        //create views
        let views = config.map((userConfig, index) => {
            let pluginSpec = specsIndex[userConfig.url];
            console.log(userConfig, pluginSpec);
            return createElement(Cell, {layout, userConfig, pluginSpec, key: index});
        });

        //create root props
        let mapStateToMainProps = specs
            .filter(spec => spec.mapRootState)
            .reduce((mapper, spec) => {
                return (state, props) => {
                    let newProps = mapper(state, props);
                    let pluginProps = spec.mapRootState(state, newProps);
                    return Util.spread(newProps, pluginProps);
                }
        }, (state, props) => props);

        let View = env.connect(mapStateToMainProps)(MainView);

        //init main view
        ReactDOM.render(createElement(
            ReactRedux.Provider,
            { store },
            createElement(View, {
                className: 'layout-canvas'
            }, views)
        ), document.getElementById('view'));
    });

}
