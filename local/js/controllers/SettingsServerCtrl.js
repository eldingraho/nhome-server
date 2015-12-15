(function() {
  "use strict";

  angular
    .module('nHome')
    .controller('SettingsServerCtrl', ['$scope', '$rootScope', '$http', 'socket', 'dataService', function($scope, $rootScope, $http, socket, dataService) {

      var server = this;

      var deleteServerCount = 0;
      server.activeUser = dataService.user();
      server.bridges = dataService.bridge();
      server.userList = dataService.userList();
      var leaveServerModal = document.querySelector('.leave-server-modal');

      document.querySelector('.frame-wrap').appendChild(leaveServerModal);
      /* get server log */
      socket.emit('getLog', null, function(log) {
        server.serverLog = log;
      });
      /* get server data, updates */
      socket.emit('getServerStatus', null, function(serverStatus) {
        console.log(serverStatus);
        server.serverInfoData = serverStatus;
        var url = 'https://neosoft-updates.s3.amazonaws.com/zupdate/NHomeServer/' + serverStatus.version + '.xml';
        $http.get(url)
          .success(function(data, status) {
            var updates = $(data).find('update').length;
            if (updates) {
              server.upToDate = false;
            } else {
              server.upToDate = true;
            }
          })
          .error(function(data, status) {
            $rootScope.$broadcast('checkFailed');
          });
        setTimeout(function() {
          getGoogleMap({
            lat: parseFloat(server.serverInfoData.latitude),
            lng: parseFloat(server.serverInfoData.longitude)
          });
        }, 250);
      });
      /* listen for bridge updates */
      socket.on('bridgeInfo', function(bridge) {
        server.bridges = bridge;
      });
      /* listen for server log updates */
      socket.on('log', function(newLog) {
        server.serverLog = newLog;
      });
      /* download server configuration, backup */
      socket.emit('configBackup', null, function(config) {
        var data = JSON.stringify(config);
        var backup = document.getElementById('download-backup');
        backup.setAttribute('href', 'data:application/json;charset=utf8,' + encodeURIComponent(data));
      });

      /* update app, if possible */
      server.updateApp = function() {
        socket.emit('updateApp', null, function(data) {
          console.log(data);
        });
      };
      /* change server name */
      server.changeServerName = function(newName) {
        socket.emit('configSet', 'name', newName);
        sessionStorage.activeServerName = newName;
        $rootScope.$broadcast('newServerName', newName);
      };
      /* restore server configuration */
      $scope.restore = function(elem) {

        var backupRestore = elem;
        var reader = new FileReader();
        reader.addEventListener('loadend', function() {
          var config;
          try {
            config = JSON.parse(reader.result);
          } catch (e) {
            console.log(e);
            alert('Failed to read config data');
            return false;
          }
          socket.emit('configRestore', config, function() {
            alert('Config restored, please restart your server');
          });
        });
        reader.readAsText(backupRestore.files[0]);
      };

      /* bridge rename */
      server.leaveServer = function() {
        socket.emit('permServerRemoveSelf', null, function(response) {
          if (response) {
            leaveServerModal.style.display = 'block';
            socket.emit('getServers', null, function(servers) {
              console.log(servers);
              if (servers.length > 1) {
                server.leveServers = servers;
              } else if (server.length == 1) {
                server.switchServer(servers[0]);
              } else {
                sessionStorage.removeItem('activeServer');
                sessionStorage.removeItem('userInfoData');
                sessionStorage.removeItem('gravatar');
                location.reload(true);
              }
            });
          }
        });
      };

      server.switchServer = function(server) {
        console.log(server);
        sessionStorage.activeServer = JSON.stringify(server);
        sessionStorage.activeRoom = JSON.stringify({
          name: 'Dashboard',
          id: 'dashboard'
        });
        location.reload(true);
      };

      /*  delete server */
      server.deleteServer = function() {
        deleteServerCount += 1;
        if (deleteServerCount === 2) {

          socket.emit('deleteServer', null, function(data) {
            console.log(data);
            /* redirect */
            if (data) {
              socket.emit('getServers', null, function(servers) {
                sessionStorage.activeServer = JSON.stringify(servers[0]);
                location.reload(true);
              });
            }
          });
        } else {
          server.ownerPermissions = true;
          return;
        }
      };

      /* google maps */
      server.useIpAddress = function() {
        if (document.getElementById('google-maps-IP').checked) {
          $scope.$broadcast('useIP');
        }
      };

      function getGoogleMap(coordinates) {
        $scope.$broadcast('getGoogleMap', coordinates);
      };

      /* when IP location is changed */
      $scope.$on('notIpLocation', function(event) {
        document.getElementById('google-maps-IP').checked = false;
      });



      /* USERS SETTINGS */
      /* user setings, invite, delete, change level */
      server.inviteUser = function() {
        var inviteEmail = document.getElementById('invite-email').value;
        var inviteMsg = document.getElementById('invite-msg').value;
        var inviteStatus = document.getElementById('invite-status').value;

        console.log(inviteMsg, inviteStatus);

        socket.emit4('inviteUser', inviteEmail, inviteMsg, inviteStatus, function(invite) {
          console.log(invite);
          if (!invite) {
            alert('Inviting ' + inviteEmail + ' failed!');
          }
        });
      };

      server.changeUserLevel = function(email, level) {
        if (level === 'DELETE') {
          deleteUser(email);
        } else {
          console.log(email, level);
          socket.emit('permServerSetLevel', email, level, function(data) {
            console.log(data);
          });
        }
      };

      function deleteUser(email) {
        socket.emit('permServerRemove', email, function(removeUser) {
          if (removeUser) {
            angular.forEach(server.userList, function(user) {
              if (user.email === email) {
                server.userList.splice(server.userList.indexOf(user), 1);
              }
            })
          }
        });
      };
    }]);
}());