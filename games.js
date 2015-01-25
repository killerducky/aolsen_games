// Meteor
//   users
//   all_roles
//   games
//     game_roles

AllRoles = new Mongo.Collection("all_roles");
Games    = new Mongo.Collection("games");
GamePlayers = new Mongo.Collection("game_players");
GameRoles   = new Mongo.Collection("game_roles");

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
  });
  Template.seerNight.helpers({
    // TODO: remove duplication
    players: function() {
      return GamePlayers.find({gameid:this._id});
    },
    selectedPlayer: function() {
      // TODO: Direct object compare didn't work, why not?
      //console.log("selectedPlayer", this, Session.get("seer-player"));
      //var result = Session.get("seer-player") === this;
      //console.log(result);
      return Session.get("seer-player") && Session.get("seer-player")._id === this._id;
    },
    selectedMiddle: function() {
      return Session.get("seer-player") === null;
    },
  });

  function isPlayingThisGameTest(game) {
    var gamePlayerId = GamePlayers.findOne({gameid:game._id, userid:Meteor.userId()});
    return (gamePlayerId) ? true : false;
  }


  Template.body.events({
    "click .add-game": function() {
      Meteor.call("addGame");
    },
    "click .start-game": function() {
      Meteor.call("startGame");
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
      // TODO: Why can I not get the game object itself instead of the game._id?
      var gameId = $(event.currentTarget).attr("data-game");
      Meteor.call("addRole", gameId, this);
    },
    "click .delete-role": function () {
      Meteor.call("deleteRole", this);
    },
  });
  Template.seerNight.events({
    "click .seer-sel-player": function() {
      Session.set("seer-player", this);
    },
    "click .seer-sel-middle": function() {
      Session.set("seer-player", null);
    },
    "click .seer-submit": function() {
      console.log("submit", Session.get("seer-player"), this);
    },
  });

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

Meteor.methods({
  addGame: function () {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    var gameId = Games.insert({ createdAt: new Date(), text: "Game created by "+Meteor.user().username, owner: Meteor.userId()});
    Meteor.call("joinGame", gameId);
  },
  deleteGame: function (gameId) {
    //if (game.owner !== Meteor.userId()) {}
    Games.remove(gameId);
  },
  joinGame: function (gameId) {
    if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
    GamePlayers.insert({gameid:gameId, userid:Meteor.userId(), username:Meteor.user().username});
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
}
