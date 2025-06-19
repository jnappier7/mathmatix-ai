// utils/autoRouteLoader.js
const fs = require("fs");
const path = require("path");

function autoMountRoutes(app, options = {}) {
  const routesDir = options.routesPath || path.join(__dirname, "../routes");

  // Role-specific middleware from your auth file
  const {
    isAuthenticated,
    isTeacher,
    isAdmin,
    isParent
  } = require("../middleware/auth");

  // Define route-specific middleware stacks
  const middlewareMap = {
    chat: [isAuthenticated],
    welcome: [isAuthenticated],
    memory: [isAuthenticated],
    guidedLesson: [isAuthenticated],
    student: [isAuthenticated],
    teacher: [isAuthenticated, isTeacher],
    admin: [isAuthenticated, isAdmin],
    parent: [isAuthenticated, isParent],
    avatar: [isAuthenticated],
    leaderboard: [isAuthenticated],
  };

  // Optional: skip these files entirely
  const skipRoutes = new Set(options.skip || [
    "summary_generator"
  ]);

  fs.readdirSync(routesDir).forEach(file => {
    if (!file.endsWith(".js")) return;

    const routeName = file.replace(".js", "");

    if (skipRoutes.has(routeName)) {
      console.log(`⏭️ Skipped route: /${routeName}`);
      return;
    }

    const routeModule = require(path.join(routesDir, file));
    const route = routeModule.router || routeModule;

    if (typeof route !== "function" || !route.stack) {
      console.warn(`⚠️ ${file} does not export a valid Express router. Skipping.`);
      return;
    }

    const routePath = `/${routeName}`;
    const middlewares = middlewareMap[routeName] || [];

    app.use(routePath, ...middlewares, route);

    if (middlewares.length > 0) {
      const labels = middlewares.map(fn => fn.name).join(" + ");
      console.log(`🔐 Auto-mounted protected route: ${routePath} [${labels}]`);
    } else {
      console.log(`✅ Auto-mounted public route: ${routePath}`);
    }
  });
}

module.exports = autoMountRoutes;
