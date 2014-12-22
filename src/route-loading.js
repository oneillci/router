import {REPLACE, buildNavigationPlan} from './navigation-plan';

export class RouteLoader {
  loadRoute(config){
    throw Error('Route loaders must implment "loadRoute(config)".');
  }
}

export class LoadRouteStep {
  static inject(){ return [RouteLoader]; }
  constructor(routeLoader){
    this.routeLoader = routeLoader;
  }

  run(navigationContext, next) {
    return loadNewRoute(this.routeLoader, navigationContext)
      .then(next)
      .catch(next.cancel);
  }
}

export function loadNewRoute(routeLoader, navigationContext) {
  var toLoad = determineWhatToLoad(navigationContext);
  var loadPromises = toLoad.map(current => loadRoute(
    routeLoader,
    current.navigationContext,
    current.viewPortPlan
    )
  );

  return Promise.all(loadPromises);
}

function determineWhatToLoad(navigationContext, toLoad) {
  var plan = navigationContext.plan;
  var next = navigationContext.nextInstruction;

  toLoad = toLoad || [];

  for (var viewPortName in plan) {
    var viewPortPlan = plan[viewPortName];

    if (viewPortPlan.strategy == REPLACE) {
      toLoad.push({
        viewPortPlan: viewPortPlan,
        navigationContext: navigationContext
      });

      if (viewPortPlan.childNavigationContext) {
        determineWhatToLoad(viewPortPlan.childNavigationContext, toLoad);
      }
    } else {
      var viewPortInstruction = next.addViewPortInstruction(
          viewPortName,
          viewPortPlan.strategy,
          viewPortPlan.prevModuleId,
          viewPortPlan.prevComponent
          );

      if (viewPortPlan.childNavigationContext) {
        viewPortInstruction.childNavigationContext = viewPortPlan.childNavigationContext;
        determineWhatToLoad(viewPortPlan.childNavigationContext, toLoad);
      }
    }
  }

  return toLoad;
}

function loadRoute(routeLoader, navigationContext, viewPortPlan) {
  var moduleId = viewPortPlan.config.moduleId;
  var next = navigationContext.nextInstruction;

  return resolveComponent(
    routeLoader,
    navigationContext.router,
    viewPortPlan
    ).then(component => {

    var viewPortInstruction = next.addViewPortInstruction(
      viewPortPlan.name,
      viewPortPlan.strategy,
      moduleId,
      component
      );

    var controller = component.executionContext;

    if (controller.router) {
      var path = next.getWildcardPath();

      return controller.router.createNavigationInstruction(path, next)
        .then(childInstruction => {
          viewPortPlan.childNavigationContext = controller.router
            .createNavigationContext(childInstruction);

          return buildNavigationPlan(viewPortPlan.childNavigationContext)
            .then(childPlan => {
              viewPortPlan.childNavigationContext.plan = childPlan;
              viewPortInstruction.childNavigationContext = viewPortPlan.childNavigationContext;

              return loadNewRoute(routeLoader, viewPortPlan.childNavigationContext);
            });
        });
    }
  });
}

function resolveComponent(routeLoader, router, viewPortPlan) {
  var possibleRouterViewPort = router.viewPorts[viewPortPlan.name];

  return routeLoader.loadRoute(viewPortPlan.config).then(type => {
    return new Promise((resolve, reject) => {
      function createChildRouter() {
        return router.createChild();
      }

      function getComponent(routerViewPort) {
        routerViewPort.getComponent(type, createChildRouter, viewPortPlan.config)
                      .then(resolve)
                      .catch(error);
      }

      if (possibleRouterViewPort) {
        getComponent(possibleRouterViewPort);
      } else {
        router.viewPorts[viewPortPlan.name] = getComponent;
      }
    });
  });
}