var couchbaseApp = angular.module("starter", ["ionic", "ngCouchbaseLite"]);

var todoDatabase = null;

couchbaseApp.run(function($ionicPlatform, $couchbase) {
    $ionicPlatform.ready(function() {
        if(window.cordova && window.cordova.plugins.Keyboard) {
            cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
        }
        if(window.StatusBar) {
            StatusBar.styleDefault();
        }
        if(!window.cblite) {
            alert("Couchbase Lite is not installed!");
        } else {
            cblite.getURL(function(err, url) {
                if(err) {
                    alert("There was an error getting the database URL");
                    return;
                }
                todoDatabase = new $couchbase(url, "todo");
                todoDatabase.createDatabase().then(function(result) {
                    var todoViews = {
                        lists: {
                            map: function(doc) {
                                if(doc.type == "list" && doc.title) {
                                    emit(doc._id, {title: doc.title, rev: doc._rev})
                                }
                            }.toString()
                        },
                        tasks: {
                            map: function(doc) {
                                if(doc.type == "task" && doc.title && doc.list_id) {
                                    emit(doc._id, {title: doc.title, list_id: doc.list_id, rev: doc._rev})
                                }
                            }.toString()
                        }
                    };
                    todoDatabase.createDesignDocument("_design/todo", todoViews);
                }, function(error) {
                    console.error(JSON.stringify(error));
                });
             });
         }
    });
});

couchbaseApp.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state("login", {
            url: "/login",
            templateUrl: "templates/login.html",
            controller: "LoginController"
        })
        .state("todoLists", {
            url: "/todoLists",
            templateUrl: "templates/todolists.html",
            controller: "TodoListsController"
        })
        .state("tasks", {
            url: "/tasks/:listId",
            templateUrl: "templates/tasks.html",
            controller: "TaskController"
        });
    $urlRouterProvider.otherwise("/login");
});

couchbaseApp.controller("LoginController", function($scope, $state, $ionicHistory) {

    $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: true
    });

    $scope.basicLogin = function() {
        todoDatabase.replicate("todo", "http://192.168.56.1:4984/todos", true).then(function(result) {
            todoDatabase.replicate("http://192.168.56.1:4984/todos", "todo", true).then(function(result) {
                console.log("REPLICATION -> " + JSON.stringify(result));
                $state.go("todoLists");
            }, function(error) {
                console.error("ERROR -> " + JSON.stringify(error));
            });
        }, function(error) {
            console.error("ERROR -> " + JSON.stringify(error));
        });
    }

});

couchbaseApp.controller("TodoListsController", function($scope, $state, $ionicPopup, $couchbase, $rootScope) {

    $scope.lists = {};

    $rootScope.$on("couchbase:change", function(event, args) {
        for(var i = 0; i < args.results.length; i++) {
            if(args.results[i].hasOwnProperty("deleted") && args.results[i].deleted === true) {
                delete $scope.lists[args.results[i].id];
            } else {
                if(args.results[i].id.indexOf("_design") === -1) {
                    todoDatabase.getDocument(args.results[i].id).then(function(result) {
                        if(result.type === "list") {
                            $scope.lists[result._id] = result;
                        }
                    });
                }
            }
        }
    });

    todoDatabase.queryView("_design/todo", "lists").then(function(result) {
        for(var i = 0; i < result.rows.length; i++) {
            $scope.lists[result.rows[i].id] = result.rows[i];
        }
        todoDatabase.listen();
    }, function(error) {
        console.log("ERROR QUERYING VIEW -> " + JSON.stringify(error));
    });

    $scope.insert = function() {
        $ionicPopup.prompt({
            title: 'Enter a new TODO list',
            inputType: 'text'
        })
        .then(function(result) {
            var obj = {
                title: result,
                type: "list",
                owner: "guest"
            };
            todoDatabase.createDocument(obj).then(function(result) {
                obj._id = result.id;
                obj._rev = result.rev;
            }, function(error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        });
    }

    $scope.delete = function(list) {
        todoDatabase.deleteDocument(list._id, list._rev).then(function(result) {
            todoDatabase.queryView("_design/todo", "tasks").then(function(result) {
                for(var i = 0; i < result.rows.length; i++) {
                    if(result.rows[i].value.list_id == list._id) {
                        todoDatabase.deleteDocument(result.rows[i].id, result.rows[i].value.rev);
                    }
                }
            }, function(error) {
                console.log("ERROR QUERYING VIEW -> " + JSON.stringify(error));
            });
        }, function(error) {
            console.log("ERROR -> " + JSON.stringify(error));
        });
    }

});

couchbaseApp.controller("TaskController", function($scope, $rootScope, $stateParams, $ionicPopup, $ionicHistory, $couchbase) {

    $scope.todoList = $stateParams.listId;
    $scope.tasks = {};

    $rootScope.$on("couchbase:change", function(event, args) {
        for(var i = 0; i < args.results.length; i++) {
            if(args.results[i].hasOwnProperty("deleted") && args.results[i].deleted === true) {
                delete $scope.tasks[args.results[i].id];
            } else {
                if(args.results[i].id.indexOf("_design") === -1) {
                    todoDatabase.getDocument(args.results[i].id).then(function(result) {
                        if(result.type === "task") {
                            $scope.tasks[result._id] = result;
                        }
                    });
                }
            }
        }
    });

    todoDatabase.queryView("_design/todo", "tasks").then(function(result) {
        for(var i = 0; i < result.rows.length; i++) {
            if(result.rows[i].value.list_id == $stateParams.listId) {
                $scope.tasks[result.rows[i].id] = {"_id": result.rows[i].id, "title": result.rows[i].value.title, "list_id": result.rows[i].value.list_id, "_rev": result.rows[i].value.rev};
            }
        }
    }, function(error) {
        console.log("ERROR QUERYING VIEW -> " + JSON.stringify(error));
    });

    $scope.insert = function() {
        $ionicPopup.prompt({
            title: 'Enter a new TODO task',
            inputType: 'text'
        })
        .then(function(result) {
            var obj = {
                title: result,
                type: "task",
                list_id: $stateParams.listId,
                owner: "guest"
            };
            todoDatabase.createDocument(obj).then(function(result) {
                obj._id = result.id;
                obj._rev = result.rev;
            }, function(error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        });
    }

    $scope.delete = function(task) {
        todoDatabase.deleteDocument(task._id, task._rev);
    }

    $scope.back = function() {
        $ionicHistory.goBack();
    }

});
