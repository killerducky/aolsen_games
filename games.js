// Meteor
//   users
//   all_roles
//   games
//     game_roles

AllRoles = new Mongo.Collection("all_roles");
Games    = new Mongo.Collection("games");
GamePlayers = new Mongo.Collection("game_players");
GameRoles   = new Mongo.Collection("game_roles");

// TODO: Move this to a separate file
var GamePlayer = function (gameid, userid, username) {
  this.gameid = gameid;
  this.userid = userid;
  this.username = username;
  // TODO: Server should only publish this to everyone after the game is over
  this.myinfo = {
    orig_role      : null,    // rolename string
    curr_role      : null,    // rolename string
    night_targets  : [],      // userid or index to the unused_roles array
    night_done     : false,
    voted_for      : null,    // userid
    received_votes : 0,
    win            : false,
  };
};

var Game = function (user) {
  this.createdAt = new Date();
  this.text      = "Game created by "+user.username;
  this.ownerid   = user._id;
  this.ownername = user.username;
  this.gameState = "Creating";   // Creating, Night, Day, Done
  this.myinfo = {
    //this.time                  : null,
    //this.game_starter_last_seen: 0,
    unused_roles          : [],
    orig_werewolves       : [],
    example_game          : true,
    no_shuffle            : false,
  };
};

// Fisher-Yates shuffle http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

if (Meteor.isClient) {
  // This code only runs on the client
  Meteor.subscribe("all_roles");
  Meteor.subscribe("games");
  Meteor.subscribe("game_players");
  Meteor.subscribe("game_roles");
  Meteor.subscribe("directory");
  Template.body.helpers({
    users: function() {
      return Meteor.users.find({});
    },
    all_roles: function() {
      return AllRoles.find({}, {sort: {order:1}});
    },
    games: function() {
      return Games.find({});
    },
    players: function() {
      return GamePlayers.find({gameid:this._id});
    },
    game_roles: function() {
      return GameRoles.find({gameid:this._id}, {sort:{order:1}});
    },
    isPlayingThisGame: function() {
      result = isPlayingThisGameTest(this);
      return result;
    },
    gameStateNight: function() { 
      return Games.findOne({_id:this._id}).gameState === "Night"; 
    },
    myRole: function(role) {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      return gamePlayer && gamePlayer.myinfo.orig_role === role;
    },
  });

  function isPlayingThisGameTest(game) {
    var gamePlayer = GamePlayers.findOne({gameid:game._id, userid:Meteor.userId()});
    return (gamePlayer) ? true : false;
  }


  Template.body.events({
    "click .add-game": function() {
      Meteor.call("addGame");
    },
    "click .start-game": function() {
      Meteor.call("startGame", this);
    },
    "click .delete-game": function() {
      Meteor.call("deleteGame", this._id);
    },
    "click .toggle-join": function() {
      result = isPlayingThisGameTest(this);
      if (result) {
        Meteor.call("leaveGame", this._id);
      } else {
        Meteor.call("joinGame", this._id);
      }
    },
    "click .add-role": function (event) {
      // TODO: This method can't pass the real object, only a string gameId.
      //       Maybe use a jQuery call to find the parent object?
      var gameId = $(event.currentTarget).attr("data-game");
      Meteor.call("addRole", gameId, this);
    },
    "click .delete-role": function () {
      Meteor.call("deleteRole", this);
    },
  });
  Template.gameState.helpers({
    players: function() {  // TODO: remove duplication
      return GamePlayers.find({gameid:this._id}); 
    },
    gameStateNight: function() { 
      return Games.findOne({_id:this._id}).gameState === "Night"; 
    },
    myRole: function() {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      if (!gamePlayer) {
        return "N/A -- You are an observer";
      }
      return gamePlayer.myinfo.orig_role;
    },
  });
  //Template.gameState.events({
  //});
  Template.seerNight.helpers({
    players: function() {  // TODO: remove duplication
      return GamePlayers.find({gameid:this._id}); 
    },
    seerResults: function() {
      return "Seer Results will go here";
    },
  });
  Template.seerNight.events({
    "submit form": function(event) {
      event.preventDefault();
      result = $("input[name='player']:checked").val();
      console.log("submit", result);
      //TODO: Need to move this code server side only
      //if (result.type === "middle") {
      //  peeks = shuffleArray([0,1,2]);
      //  GamePlayers.update({gameid:this._id}, {$set: {"myinfo.night_targets": [peeks[0], peeks[1]],
      //                                                "myinfo.night_done"   : true}});
      //}
    },
  });
  Template.wolfNight.helpers({
    wolfNightScript: function() {
      var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
      var game = Games.findOne({_id:this._id});
      var orig_werewolves = game.myinfo.orig_werewolves;
      if (orig_werewolves.length === 1) {
        var i = gamePlayer.myinfo.night_targets[0];
        var centerPeek = game.myinfo.unused_roles[i].name;
        str = "You are the only Werewolf. Center card #" + (i+1) + " is " + centerPeek;
        return str;
      } else {
        str = "The Werewolves are:";
        for (var i=0; i<orig_werewolves.length; i++) {
          str += " " + orig_werewolves[i].username;
        }
        return str;
      }
    },
  });

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

Meteor.methods({
  addGame: function () {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    var gameId = Games.insert(new Game(Meteor.user()));
    Meteor.call("joinGame", gameId);
  },
  deleteGame: function (gameId) {
    //if (game.owner !== Meteor.userId()) {}
    Games.remove(gameId);
  },
  joinGame: function (gameId) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GamePlayers.insert(new GamePlayer(gameId, Meteor.userId(), Meteor.user().username));
  },
  leaveGame: function (gameId) {
    var gamePlayerId = GamePlayers.findOne({gameid:gameId, userid:Meteor.userId()});
    GamePlayers.remove(gamePlayerId);
  },
  addRole: function (gameId, role) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GameRoles.insert({gameid:gameId, roleid:role._id, name:role.name, order:role.order});
  },
  deleteRole: function (role) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GameRoles.remove(role._id);
  },
});

if (Meteor.isServer) {
  Meteor.publish("all_roles", function() {
    return AllRoles.find({});
  });
  Meteor.publish("games", function() {
    return Games.find({});
  });
  Meteor.publish("game_players", function() {
    return GamePlayers.find({});
  });
  Meteor.publish("game_roles", function() {
    return GameRoles.find({});
  });
  Meteor.publish("directory", function() {
    return Meteor.users.find({},{fields: {username:1}});
  });
  Meteor.startup(function () {
    if (AllRoles.find().count() === 0) {
      AllRoles.insert({name: "Werewolf",     order: 1});
      AllRoles.insert({name: "Seer",         order: 2});
      AllRoles.insert({name: "Robber",       order: 3});
      AllRoles.insert({name: "Troublemaker", order: 4});
      AllRoles.insert({name: "Insomniac",    order: 5});
      AllRoles.insert({name: "Villager",     order: 999});
    }
  });
  Meteor.methods({
    startGame: function(game) {
      Games.update({_id:game._id}, {$set: {"gameState": "Creating"}});  // Avoid races if we are recreating the game
      var gameRoles, gamePlayers, unusedRoles;
      if (true) {  // TODO: For now just clear state. Should really check and assert an error instead
        Games.update({_id:game._id}, {$set: {"myinfo.orig_werewolves": []}});
      }
      gameRoles = GameRoles.find({gameid:game._id}).fetch();
      gamePlayers = GamePlayers.find({gameid:game._id}).fetch();
      if (gamePlayers.length < 2) {   // TODO: Fix minimum code
        console.log("Must have at least 2 players", gameRoles.length, gamePlayers.length);
        return
      }
      if (gameRoles.length !== gamePlayers.length+3) { // TODO: Better error display
        console.log("Must have 3 more roles than players", gameRoles.length, gamePlayers.length);
        return
      }

      // Assign roles
      unusedRoles = gameRoles.slice(0);
      if (!game.myinfo.no_shuffle) {
        shuffleArray(unusedRoles);
      }
      for (var pnum=0; pnum<gamePlayers.length; pnum++) {
        var gamePlayer = gamePlayers[pnum];
        var role = unusedRoles.pop();
        GamePlayers.update({_id:gamePlayer._id}, {$set: { "myinfo.curr_role": role.name, "myinfo.orig_role": role.name }});
        if (role.name === "Werewolf") {
          Games.update({_id:game._id}, {$push: {"myinfo.orig_werewolves": {userid:gamePlayer.userid, username:gamePlayer.username}}});
        }
      }
      Games.update({_id:game._id}, {$set: {"myinfo.unused_roles": unusedRoles}});

      // Werewolf night logic -- no input from user required, so execute now
      var orig_werewolves = game.myinfo.orig_werewolves;
      for (var pnum=0; pnum<gamePlayers.length; pnum++) {
        var gamePlayer = gamePlayers[pnum];
        if (gamePlayer.myinfo.orig_role === "Werewolf") {
          if (orig_werewolves.length === 1) {
            var pick = Math.floor((Math.random()*3));  // random number between 0 and 2
            var centerPeek = game.myinfo.unused_roles[pick].name;
            GamePlayers.update({_id:gamePlayer._id}, {$set: {"myinfo.night_targets": [pick],
                                                             "myinfo.night_done"   : true}});
          } else {
            GamePlayers.update({gameid:this._id}, {$set: {"myinfo.night_done"   : true}});
          }
        }
      }

      // Change state to night
      Games.update({_id:game._id}, {$set: {"gameState": "Night"}});
    },
  });
}
