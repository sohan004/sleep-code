export interface Framework {
  id: string;
  label: string;
  tagline: string;
}

export interface Language {
  id: string;
  label: string;
  frameworks: Framework[];
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  languages: Language[];
}

export const CATALOG: Category[] = [
  {
    id: "backend",
    label: "Backend",
    icon: "⚙️",
    blurb: "APIs, services and databases",
    languages: [
      {
        id: "js-ts",
        label: "JavaScript / TypeScript",
        frameworks: [
          { id: "nodejs", label: "Node.js", tagline: "node:http · streams · workers" },
          { id: "express", label: "Express.js", tagline: "Routers · middleware · Zod" },
          { id: "nestjs", label: "NestJS", tagline: "Modules · DI · TypeORM" },
          { id: "fastify", label: "Fastify", tagline: "Plugins · JSON schema · hooks" },
          { id: "socketio", label: "Socket.io", tagline: "Rooms · namespaces · acks" },
        ],
      },
      {
        id: "python",
        label: "Python",
        frameworks: [
          { id: "django", label: "Django", tagline: "ORM · DRF · signals" },
          { id: "flask", label: "Flask", tagline: "Blueprints · SQLAlchemy" },
          { id: "fastapi", label: "FastAPI", tagline: "Pydantic · async SQLAlchemy" },
          { id: "pyramid", label: "Pyramid", tagline: "Views · traversal · SQLAlchemy" },
        ],
      },
      {
        id: "php",
        label: "PHP",
        frameworks: [
          { id: "laravel", label: "Laravel", tagline: "Eloquent · queues · policies" },
          { id: "symfony", label: "Symfony", tagline: "Doctrine · Messenger · attributes" },
          { id: "codeigniter", label: "CodeIgniter", tagline: "Controllers · models · filters" },
          { id: "cakephp", label: "CakePHP", tagline: "Table classes · Bake · ORM" },
        ],
      },
      {
        id: "java",
        label: "Java",
        frameworks: [
          { id: "spring-boot", label: "Spring Boot", tagline: "REST · JPA · Security" },
          { id: "hibernate", label: "Hibernate", tagline: "Entities · HQL · Criteria" },
          { id: "quarkus", label: "Quarkus", tagline: "Panache · RESTEasy · CDI" },
        ],
      },
      {
        id: "csharp",
        label: "C# (.NET)",
        frameworks: [{ id: "aspnet-core", label: "ASP.NET Core", tagline: "Minimal APIs · EF Core" }],
      },
      {
        id: "go",
        label: "Go",
        frameworks: [
          { id: "gin", label: "Gin", tagline: "Handlers · binding · middleware" },
          { id: "fiber", label: "Fiber", tagline: "Express-style · fasthttp" },
          { id: "echo", label: "Echo", tagline: "Groups · validators · JWT" },
          { id: "gorilla-mux", label: "Gorilla mux", tagline: "Routers · subrouters · net/http" },
        ],
      },
      {
        id: "ruby",
        label: "Ruby",
        frameworks: [
          { id: "rails", label: "Ruby on Rails", tagline: "ActiveRecord · Hotwire · jobs" },
          { id: "sinatra", label: "Sinatra", tagline: "Routes · Sequel · Rack" },
        ],
      },
      {
        id: "rust",
        label: "Rust",
        frameworks: [{ id: "axum", label: "Axum", tagline: "Extractors · SQLx · Tokio" }],
      },
    ],
  },
  {
    id: "web",
    label: "Web",
    icon: "🌐",
    blurb: "Frontend and full-stack apps",
    languages: [
      {
        id: "html-css",
        label: "HTML & CSS",
        frameworks: [{ id: "html-css", label: "HTML5 + CSS3", tagline: "Semantic markup · Grid · custom properties" }],
      },
      {
        id: "js-ts",
        label: "JavaScript / TypeScript",
        frameworks: [
          { id: "react", label: "React", tagline: "Hooks · context · Query" },
          { id: "vue", label: "Vue.js", tagline: "Composition API · Pinia" },
          { id: "angular", label: "Angular", tagline: "Signals · standalone · RxJS" },
          { id: "svelte", label: "Svelte", tagline: "Runes · stores · transitions" },
          { id: "nextjs", label: "Next.js", tagline: "App Router · RSC · Route Handlers" },
          { id: "nuxt", label: "Nuxt", tagline: "Nitro · useFetch · auto-imports" },
          { id: "remix", label: "Remix", tagline: "Loaders · actions · forms" },
          { id: "sveltekit", label: "SvelteKit", tagline: "load · form actions · hooks" },
        ],
      },
    ],
  },
  {
    id: "app",
    label: "App",
    icon: "📱",
    blurb: "Mobile and desktop apps",
    languages: [
      {
        id: "js-ts",
        label: "JavaScript / TypeScript",
        frameworks: [
          { id: "react-native", label: "React Native", tagline: "FlatList · navigation · Reanimated" },
          { id: "ionic", label: "Ionic", tagline: "Capacitor · Angular · native APIs" },
          { id: "expo", label: "Expo", tagline: "Expo Router · EAS · SDK modules" },
        ],
      },
      {
        id: "dart",
        label: "Dart",
        frameworks: [{ id: "flutter", label: "Flutter", tagline: "Widgets · Riverpod · go_router" }],
      },
      {
        id: "kotlin",
        label: "Kotlin",
        frameworks: [{ id: "jetpack-compose", label: "Android Jetpack", tagline: "Compose · ViewModel · Room" }],
      },
      {
        id: "swift",
        label: "Swift",
        frameworks: [
          { id: "swiftui", label: "SwiftUI", tagline: "Views · Observation · async/await" },
          { id: "uikit", label: "UIKit", tagline: "View controllers · diffable data" },
        ],
      },
      {
        id: "csharp",
        label: "C#",
        frameworks: [
          { id: "maui", label: ".NET MAUI", tagline: "XAML · MVVM · Shell" },
          { id: "xamarin", label: "Xamarin", tagline: "Xamarin.Forms · bindings" },
        ],
      },
    ],
  },
  {
    id: "game",
    label: "Game",
    icon: "🎮",
    blurb: "Engines and game frameworks",
    languages: [
      {
        id: "csharp",
        label: "C#",
        frameworks: [{ id: "unity", label: "Unity", tagline: "MonoBehaviour · physics · Input System" }],
      },
      {
        id: "cpp",
        label: "C++",
        frameworks: [
          { id: "unreal", label: "Unreal Engine", tagline: "Actors · UPROPERTY · GAS" },
          { id: "cryengine", label: "CryEngine", tagline: "Entity components · Schematyc" },
        ],
      },
      {
        id: "gdscript",
        label: "GDScript",
        frameworks: [{ id: "godot", label: "Godot Engine", tagline: "Nodes · signals · physics" }],
      },
      {
        id: "js-ts",
        label: "JavaScript / TypeScript",
        frameworks: [
          { id: "phaser", label: "Phaser", tagline: "Scenes · Arcade physics · tweens" },
          { id: "threejs", label: "Three.js", tagline: "Scenes · shaders · GLTF" },
          { id: "babylonjs", label: "Babylon.js", tagline: "Meshes · Havok · PBR" },
        ],
      },
      {
        id: "python",
        label: "Python",
        frameworks: [
          { id: "pygame", label: "Pygame", tagline: "Sprites · game loop · collisions" },
          { id: "panda3d", label: "Panda3D", tagline: "ShowBase · tasks · collisions" },
        ],
      },
      {
        id: "lua",
        label: "Lua",
        frameworks: [
          { id: "love2d", label: "LÖVE", tagline: "love.update · love.draw · physics" },
          { id: "roblox", label: "Roblox Studio", tagline: "Luau · services · RemoteEvents" },
        ],
      },
    ],
  },
];

export const ALL_FRAMEWORKS = CATALOG.flatMap((c) =>
  c.languages.flatMap((l) => l.frameworks.map((f) => ({ ...f, language: l.label, category: c.label })))
);

export const DEFAULT_STACK = "nextjs";
