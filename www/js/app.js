var couchbaseApp = angular.module("starter", ["ionic"]);

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
                console.log("URL -> " + url);
                todoDatabase = new $couchbase(url, "todo");
                todoDatabase.createDatabase().then(function(result) {
                    var todoViews = {
                        lists: {
                            map: function(doc) {
                                if(doc.type == "list" && doc.title) {
                                    emit(doc._id, doc.title)
                                }
                            }.toString()
                        },
                        tasks: {
                            map: function(doc) {
                                if(doc.type == "task" && doc.title && doc.list_id) {
                                    emit(doc._id, {title: doc.title, list_id: doc.list_id})
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

couchbaseApp.controller("LoginController", function($scope, $state) {

    $scope.basicLogin = function() {
        $state.go("todoLists");
    }

});

couchbaseApp.controller("TodoListsController", function($scope, $state, $ionicPopup, $couchbase) {

    $scope.lists = [];

    todoDatabase.queryView("_design/todo", "lists").then(function(result) {
        for(var i = 0; i < result.rows.length; i++) {
            $scope.lists.push({"_id": result.rows[i].id, "title": result.rows[i].value});
        }
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
                type: "list"
            };
            todoDatabase.createDocument(obj).then(function(result) {
                obj._id = result.id;
                $scope.lists.push(obj);
            }, function(error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        });
    }

});

couchbaseApp.controller("TaskController", function($scope, $stateParams, $ionicPopup, $couchbase) {

    $scope.todoList = $stateParams.listId;
    $scope.tasks = [];

    todoDatabase.queryView("_design/todo", "tasks").then(function(result) {
        for(var i = 0; i < result.rows.length; i++) {
            if(result.rows[i].value.list_id == $stateParams.listId) {
                $scope.tasks.push({"_id": result.rows[i].id, "title": result.rows[i].value.title, "list_id": result.rows[i].value.list_id});
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
                list_id: $stateParams.listId
            };
            todoDatabase.createDocument(obj).then(function(result) {
                obj._id = result.id;
                $scope.tasks.push(obj);
            }, function(error) {
                console.log("ERROR: " + JSON.stringify(error));
            });
        });
    }

});

couchbaseApp.factory("$couchbase", function($q, $http) {

    this.databaseUrl = null;
    this.databaseName = null;

    var couchbase = function(databaseUrl, databaseName) {
        this.databaseUrl = databaseUrl;
        this.databaseName = databaseName;
    };

    couchbase.prototype = {

        createDatabase: function() {
            return this.makeRequest("PUT", this.databaseUrl + this.databaseName);
        },

        createDesignDocument: function(designDocumentName, designDocumentViews) {
            var data = {
                views: designDocumentViews
            }
            return this.makeRequest("PUT", this.databaseUrl + this.databaseName + "/" + designDocumentName, {}, data);
        },

        getDesignDocument: function(designDocumentName) {
            return this.makeRequest("GET", this.databaseUrl + this.databaseName + "/" + designDocumentName);
        },

        queryView: function(designDocumentName, viewName) {
            return this.makeRequest("GET", this.databaseUrl + this.databaseName + "/" + designDocumentName + "/_view/" + viewName);
        },

        createDocument: function(jsonDocument) {
            return this.makeRequest("POST", this.databaseUrl + this.databaseName, {}, jsonDocument);
        },

        getAllDocuments: function() {
            return this.makeRequest("GET", this.databaseUrl + this.databaseName + "/_all_docs");
        },

        makeRequest: function(method, url, params, data) {
            var deferred = $q.defer();
            var settings = {
                method: method,
                url: url
            }
            if(params) {
                settings.params = params;
            }
            if(data) {
                settings.data = data;
            }
            $http(settings)
                .success(function(result) {
                    deferred.resolve(result);
                })
                .error(function(error) {
                    deferred.reject(error);
                });
            return deferred.promise;
        }

    };

    return couchbase;

});
