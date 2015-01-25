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
    orig_role      : null,
    curr_role      : null,
    night_targets  : [],
    night_done     : false,
    voted_for      : null,
    received_votes : 0,
    win            : false,
  };
};

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
      console.log(gameId);
      Meteor.call("addRole", gameId, this);
    },
    "click .delete-role": function () {
      Meteor.call("deleteRole", this);
    },
  });
  Template.seerNight.events({
    "submit form": function(event) {
      event.preventDefault();
      result = $("input[name='player']:checked").val();
      console.log("submit", result);
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
  startGame: function(game) {
    console.log("startGame", game);
  }
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
