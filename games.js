// One Night Werewolf

AllRoles = new Mongo.Collection("all_roles");
Games    = new Mongo.Collection("games");
GamePlayers = new Mongo.Collection("game_players");
GameRoles   = new Mongo.Collection("game_roles"); // {gameid, roleid, name, order}
PublicUsers = new Mongo.Collection("public_users");
Messages    = new Mongo.Collection("messages");   // {gameid, userid, username, creation_date, content}}

// TODO: Move this to a separate file
var GamePlayer = function (gameid, user) {
  this.gameid = gameid;
  this.userid = user._id;
  this.username = user.username;
  this.bot      = user.bot;
  // TODO: Server should only publish this to everyone after the game is over
  this.myinfo = {
    orig_role      : null,    // rolename string
    curr_role      : null,    // rolename string
    night_targets  : [],      // gameplayerid or index to the unused_roles array
    night_result   : null,    // A string describing what the player did at night. Used by Robber.
    night_done     : false,
    voted_for      : null,    // gameplayerid
    received_votes : 0,
    died           : false,
    won            : false,
  };
};

var Game = function (user) {
  this.timestamps = {
    created : new Date(),
    night   : null,
    day     : null,
    done    : null,
  };
  this.text      = "Game created by "+user.username;
  this.ownerid   = user._id;
  this.ownername = user.username;
  this.daytimer  = 90;
  this.gameState = "Creating";   // Creating, Night, Day, Done
  this.mostVotedPlayers = [];    // gameplayerid
  this.myinfo = {
    //this.time                  : null,
    //this.game_starter_last_seen: 0,
    unused_roles          : [],
    orig_werewolves       : [],
    example_game          : false,
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
function preTAP2str(preTAP) {
  if (typeof preTAP !== "object") {
    return preTAP;
  }
  var opts = {};
  if (preTAP.opts) {
    for (var key in preTAP.opts) {
      opts[key] = preTAP2str(preTAP.opts[key]);
    }
  }
  return TAPi18n.__(preTAP.TAPi18n, opts);
}

getUserLanguage = function () {
  return (Meteor.user() && Meteor.user().profile.language) || Session.get("language") || "en";
}

if (Meteor.isClient) {
  Meteor.startup(function() {
    TAPi18n.setLanguage(getUserLanguage())
  });
  UI.registerHelper("players", function() {
    return GamePlayers.find({gameid:this._id}, {sort:{username:1}});
  });
  UI.registerHelper("otherPlayers", function() {
    return GamePlayers.find({gameid:this._id, userid:{$ne:Meteor.userId()}}, {sort:{username:1}});
  });
  UI.registerHelper("gamePlayerId_username", function(gamePlayerId) {
    var gamePlayer = GamePlayers.findOne(gamePlayerId);
    return gamePlayer ? gamePlayer.username : null;
  });
  UI.registerHelper("all_roles", function() {
    return AllRoles.find({}, {sort: {order:1}});
  });
  UI.registerHelper("game_roles", function() {
    return GameRoles.find({gameid:this._id}, {sort:{order:1}});
  });
  UI.registerHelper("shortRoleName", function() {
    if (this.name === "Werewolf") { return "W"; }
    else if (this.name === "Seer") { return "S"; }
    else if (this.name === "Robber") { return "R"; }
    else if (this.name === "Troublemaker") { return "T"; }
    else if (this.name === "Insomniac") { return "I"; }
    else if (this.name === "Villager") { return "V"; }
    else { return "?"; }
  });
  UI.registerHelper("isOwnerThisGame", function() {
    return this.ownerid === Meteor.userId();
  });
  UI.registerHelper("showAllInfo", function() {
    return (this.example_game || Session.get("debug") || this.gameState === "Done");
  });
  UI.registerHelper("myNightResults", function() {
    gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return gamePlayer && preTAP2str(nightResult(this._id, GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()})._id));
  });
  UI.registerHelper("myNightDone", function() {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return gamePlayer && gamePlayer.myinfo.night_done;
  });
  UI.registerHelper("gameStateTest", function(value) {
    return Games.findOne(this._id).gameState === value;
  });
  UI.registerHelper("troublePickText", function() {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    if (gamePlayer.myinfo.night_targets.length === 0) {
      return TAPi18n.__("troublePickText1");
    } else if (gamePlayer.myinfo.night_targets.length === 1) {
      return TAPi18n.__("troublePickText2", {"swap1": GamePlayers.findOne(gamePlayer.myinfo.night_targets[0]).username});
    } else {
      throw new Meteor.Error("Error: inconsistent state");
    }
  });
  UI.registerHelper("isPlayingThisGame", function() {
    return isPlayingThisGameTest(this);
  });
  UI.registerHelper("onlineUsers", function() {
    return Meteor.users.find({"bot":{$ne:true}});
  });
  UI.registerHelper("findAllGames", function() {
    return Games.find({});
  });
  UI.registerHelper("myRole", function() {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return !gamePlayer ? "You are not playing this game" : gamePlayer.myinfo.orig_role || " ";
  });
  UI.registerHelper("myVote", function() {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return gamePlayer && gamePlayer.myinfo.voted_for && GamePlayers.findOne(gamePlayer.myinfo.voted_for).username;
  });
  UI.registerHelper("myRoleTest", function(role) {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return gamePlayer && gamePlayer.myinfo.orig_role === role;
  });
  UI.registerHelper("myNightTargetsLen", function(num) {
    var gamePlayer = GamePlayers.findOne({gameid:this._id, userid:Meteor.userId()});
    return gamePlayer && gamePlayer.myinfo.night_targets.length == num;
  });
  UI.registerHelper("thisRoleChanged", function() {
    var gamePlayer = GamePlayers.findOne(this._id);
    return gamePlayer && gamePlayer.myinfo.orig_role !== gamePlayer.myinfo.curr_role;
  });
  UI.registerHelper("randomTip", function() {
    if (!Session.get("randomTip")) {
      var tipnum = Math.floor((Math.random()*2));
      Session.set("randomTip", TAPi18n.__("tip_"+tipnum));
    }
    return Session.get("randomTip");
  });
  UI.registerHelper("thisNightResults", function() {
    return preTAP2str(nightResult(this.gameid, this._id));
  });
  UI.registerHelper("timer", function() {
    if (this.gameState === "Day") {
      var time = this.daytimer - Math.floor((Session.get("time").getTime() - this.timestamps.day.getTime())/1000);
      if (time < 0) { time = 0; }
      return TAPi18n.__("Time left") + ": " + time;
    } else {
      return null;
    }
  });
  UI.registerHelper("messages", function() {
    var tmp = Messages.find({});
    return Messages.find({gameid:this._id}, {sort:{creation_date:1}});
  });
  UI.registerHelper("roleDesc", function() {
    return this.name + "_desc";
  });
  UI.registerHelper("chatContent", function() {
    return preTAP2str(this.content);
  });
  //UI.registerHelper("t", function(key, options) {
  //  return TAPi18n.__(key, options);
  //});
  Meteor.setInterval(function () {
    Session.set('time', new Date());
  }, 1000);
  function isPlayingThisGameTest(game) {
    var gamePlayer = GamePlayers.findOne({gameid:game._id, userid:Meteor.userId()});
    return (gamePlayer) ? true : false;
  }

  function nightResult(gameid, gamePlayerId) {
    var game = Games.findOne(gameid);
    var gamePlayer = GamePlayers.findOne(gamePlayerId);
    if (!gamePlayer) {
      return "";
    }
    var night_targets = gamePlayer.myinfo.night_targets;
    var preTAP;
    if (gamePlayer.myinfo.orig_role == "Seer") {
      if (gamePlayer.myinfo.night_done) {
        if (night_targets.length === 2) {
          preTAP = {"TAPi18n":"seerNightResultsMiddlePeek", "opts":{
            "myrole":{"TAPi18n":"Seer"},
            "p1": night_targets[0],
            "r1": {"TAPi18n":game.myinfo.unused_roles[night_targets[0]].name},
            "p2": night_targets[1],
            "r2": {"TAPi18n":game.myinfo.unused_roles[night_targets[1]].name}
          }};
        } else {
          var targetPlayer = GamePlayers.findOne({_id:night_targets[0]});
          preTAP = {"TAPi18n":"seerNightResultsPlayerPeek", "opts":{
            "myrole":{"TAPi18n":"Seer"},
            "target":targetPlayer.username,
            "target_role":{"TAPi18n":targetPlayer.myinfo.orig_role}
          }};
        }
      } else {
        preTAP = "";
      }
    } else if (gamePlayer.myinfo.orig_role == "Robber") {
      if (gamePlayer.myinfo.night_done) {
        if (night_targets.length === 0) {
          preTAP = {"TAPi18n":"Did not rob"};
        } else {
          var targetPlayer = GamePlayers.findOne({_id:night_targets[0]});
          preTAP = {"TAPi18n":"robberNightResults", "opts":{
            "myrole" :{"TAPi18n":"Robber"},
            "newrole":{"TAPi18n":gamePlayer.myinfo.night_result},
            "target" :targetPlayer.username
          }};
        }
      } else {
        preTAP = "";
      }
    } else if (gamePlayer.myinfo.orig_role == "Troublemaker") {
      if (gamePlayer.myinfo.night_done) {
        if (night_targets.length === 0) {
          preTAP = {"TAPi18n":"Did not swap"};
        } else {
          preTAP = {"TAPi18n":"troubleNightResults", "opts":{
            "p1" : GamePlayers.findOne({_id:night_targets[0]}).username,
            "p2" : GamePlayers.findOne({_id:night_targets[1]}).username
          }};
        }
      } else {
        preTAP = {"TAPi18n":"Not done"};
      }
    } else if (gamePlayer.myinfo.orig_role == "Werewolf") {
      if (game.gameState === "Creating") {
        preTAP = {"TAPi18n":"Error: Not night yet"};
      } else {
        var orig_werewolves = game.myinfo.orig_werewolves;
        if (orig_werewolves.length === 1) {
          var i = gamePlayer.myinfo.night_targets[0];
          var centerPeek = game.myinfo.unused_roles[i].name;
          preTAP = {"TAPi18n":"nr_ww", "opts":{
            "myrole" : {"TAPi18n":"Werewolf"},
            "p1"     : i+1,
            "r1"     : {"TAPi18n":centerPeek}
          }};
        } else {
          var wwstr = "";
          for (var i=0; i < orig_werewolves.length-1; i++) {
            wwstr += orig_werewolves[i].username + ", ";
          }
          wwstr += orig_werewolves[orig_werewolves.length-1].username;
          preTAP = {"TAPi18n":"nr_ww_plural", "opts":{
            "myrole" : {"TAPi18n":"Werewolf"},
            "players" : wwstr
          }};
        }
      }
    } else if (gamePlayer.myinfo.orig_role == "Insomniac") {
      if (game.gameState === "Creating") {
        preTAP = {"TAPi18n":"Error: Not night yet"};
      } else if (game.gameState === "Night") {
        preTAP = {"TAPi18n":"nr_i_wait"};
      } else if (gamePlayer.myinfo.curr_role === gamePlayer.myinfo.orig_role) {
        preTAP = {"TAPi18n":"nr_i_nochange"};
      } else {
        preTAP = {"TAPi18n":"nr_i_change", "opts":{"curr_role" : gamePlayer.myinfo.curr_role}};
      }
    } else if (gamePlayer.myinfo.orig_role == "Villager") {
      preTAP = {"TAPi18n":"nr_v"};
    } else {
      preTAP = "";
    }
    return preTAP;
  }
  Template.home.rendered = function() {
    $("[data-toggle='tooltip']").tooltip();
    $("[data-toggle='popover']").popover();
  };
  Template.roleWithPopoverT.rendered = function() {
    $("[data-toggle='tooltip']").tooltip();
    $("[data-toggle='popover']").popover();
  };
  Template.home.events({
    "click .add-game": function() {
      Meteor.call("addGame");
    },
  });
  Template.appBody.events({
    "click #English": function() {
      if (Meteor.user()) {
        Meteor.users.update({_id:Meteor.userId()}, {$set:{"profile.language": "en"}});
      } else {
        Session.set("language", "en");
      }
    },
    "click #Korean": function() {
      if (Meteor.user()) {
        Meteor.users.update({_id:Meteor.userId()}, {$set:{"profile.language": "ko"}});
      } else {
        Session.set("language", "ko");
      }
    },
  });
  Template.appBody.rendered = function () {
    this.autorun(function() {
      TAPi18n.setLanguage(getUserLanguage())
    });
  };
  Template.nightTransitionModal.rendered = function() {
    console.log("ntm rendered");
    $(".nightTransitionModal").on("hidden", function() {
      console.log("ntm hidden");
      Session.set("nightAck", true);
    });
    $(".nightTransitionModal").on("shown", function() {
      console.log("ntm shown");
      $(".nightTransitionModal button.confirm").focus();
    });
    $(".nightTransitionModal").on("show");
  };
  Template.showGame.helpers({
    nightTransition: function() {
      //var transition = (this.gameState === "Night" && !Session.get("nightAck"));
      //console.log("nt", this.gameState, Session.get("nightAck"), transition);
      //return transition;
      return false; // TODO get this modal working
    },
  });
  Template.showGame.events({
    "click .start-game": function() {
      // Start or Reset game based on current game state
      // TODO: Icon should switch to a recycle instead of play
      if (this.gameState === "Creating") {
        Meteor.call("startGame", this);
      } else {
        Meteor.call("resetGame", this);
      }
    },
    "click .delete-game": function() {
      Meteor.call("deleteGame", this._id);
    },
    "click .add-bot": function() {
      Meteor.call("joinGame", this._id, {bot:true});
    },
    "click .del-bot": function() {
      Meteor.call("leaveGame", this._id, {bot:true});
    },
    "click .tog-example": function() {
      Meteor.call("toggleExample", this._id);
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
  Template.fullPlayerInfoRow.helpers({
  });
  Template.seerNight.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='player']:checked").val();
      Meteor.call("seerNightSubmit", this, Meteor.userId(), result);
    },
  });
  Template.robberNight.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='player']:checked").val();
      Meteor.call("robberNightSubmit", this, Meteor.userId(), result);
    },
  });
  Template.troubleNight.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='player']:checked").val();
      Meteor.call("troubleNightSubmit", this, Meteor.userId(), result);
    },
  });
  Template.dummyNight.events({
    "submit form": function(event) {
      event.preventDefault();
      Meteor.call("dummyNightSubmit", this, Meteor.userId());
    },
  });
  Template.vote.events({
    "submit form": function(event) {
      event.preventDefault();
      var result = $("input[name='voteplayer']:checked").val();
      Meteor.call("voteSubmit", this, Meteor.userId(), result);
    },
  });
  Template.chatT.events({
    "submit form": function(event) {
      event.preventDefault();
      var msg = event.target.message.value;
      if (msg) {
        Meteor.call("addMessage", this._id, msg);
      }
      event.target.reset();
    }
  });
  Template.chatT.rendered = function () {
    $("#messages").scrollTop(1000000);
  };
  Tracker.autorun(function () {
    var numMessages = Messages.find({}).count();
    $("#messages").scrollTop(1000000);
  });
  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

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
  Meteor.publish("public_users", function() {
    //return Meteor.users.find({"status.online":true}, {fields:{username:1}});
    return Meteor.users.find({$or: [{"status.online":true}, {"bot":true}]}, {fields:{username:1, profile:1, bot:1}});
  });
  Meteor.publish("messages", function() {
    return Messages.find({});
  });
  Meteor.startup(function () {
    if (AllRoles.find().count() === 0) {
      console.log("Init DB");
      AllRoles.insert({name: "Werewolf",     order: 1});
      AllRoles.insert({name: "Seer",         order: 2});
      AllRoles.insert({name: "Robber",       order: 3});
      AllRoles.insert({name: "Troublemaker", order: 4});
      AllRoles.insert({name: "Insomniac",    order: 5});
      AllRoles.insert({name: "Villager",     order: 999});
      Meteor.users.insert({createdAt: new Date(), username: "AliceBot",   bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "BobBot",     bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "CharlieBot", bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "DougBot",    bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "EricBot",    bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "FredBot",    bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "GaryBot",    bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "HarryBot",   bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "IrisBot",    bot:true});
      Meteor.users.insert({createdAt: new Date(), username: "JackBot",    bot:true});
    }
  });

  // TODO: Maybe this could be a live query?
  function checkNightDone(gameid) {
    var game = Games.findOne(gameid);
    if (game.gameState !== "Night") {
      throw new Meteor.Error("Should only call this at Night");
      return;
    }
    var nightDone = true;
    GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
      if (!gamePlayer.myinfo.night_done) {
        nightDone = false;
        return;
      }
    });
    if (nightDone) {
      GamePlayers.find({gameid:gameid, "myinfo.orig_role":"Troublemaker"}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.night_targets.length == 2) {
          var gp1 = GamePlayers.findOne(gamePlayer.myinfo.night_targets[0]);
          var gp2 = GamePlayers.findOne(gamePlayer.myinfo.night_targets[1]);
          GamePlayers.update(gp1, {$set: {"myinfo.curr_role" : gp2.myinfo.curr_role}});
          GamePlayers.update(gp2, {$set: {"myinfo.curr_role" : gp1.myinfo.curr_role}});
        }
      });
      Games.update(gameid, {$set: {"gameState": "Day", "timestamps.day" : new Date()}});
      botActions(game._id);
    }
  }
  function checkDayDone(gameid) {
    var game = Games.findOne(gameid);
    if (game.gameState !== "Day") {
      throw new Meteor.Error("Should only call this at Night");
    }
    var numVoted    = GamePlayers.find({gameid:gameid, "myinfo.voted_for":{$ne:null}}).count();
    var numNotVoted = GamePlayers.find({gameid:gameid, "myinfo.voted_for":     null }).count();
    // if (dayTimerExpired ? numVoted > 0 : numNotVoted === 0)
    if (numNotVoted === 0) {
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        GamePlayers.update(gamePlayer.myinfo.voted_for, {$inc:{"myinfo.received_votes":1}});
      });
      var mostVotes = 0;
      var mostVotedPlayers = [];
      var wolfDied = false;
      var atLeastOneWolf = false;
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.received_votes > mostVotes) {
          mostVotes = gamePlayer.myinfo.received_votes;
          mostVotedPlayers = [gamePlayer._id];
          wolfDied = gamePlayer.myinfo.curr_role === "Werewolf";
        } else if (gamePlayer.myinfo.received_votes === mostVotes) {
          mostVotedPlayers.push(gamePlayer._id);
          wolfDied = wolfDied || gamePlayer.myinfo.curr_role === "Werewolf";
        }
        if (mostVotes === 1) {
          mostVotedPlayers = []; // It takes at least 2 votes to kill
          wolfDied = false;
        }
        if (gamePlayer.myinfo.curr_role === "Werewolf") {
          atLeastOneWolf = true;
        }
      });
      for (var i=0; i < mostVotedPlayers.length; i++) {
        GamePlayers.update(mostVotedPlayers[i], {$set:{"myinfo.died":true}});
      }
      GamePlayers.find({gameid:gameid}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.curr_role === "Werewolf") {
          GamePlayers.update(gamePlayer, {$set:{"myinfo.won":!wolfDied}});
        } else {
          if (atLeastOneWolf) {
            GamePlayers.update(gamePlayer, {$set:{"myinfo.won":wolfDied}});
          } else {
            GamePlayers.update(gamePlayer, {$set:{"myinfo.won":mostVotedPlayers.length===0}});
          }
        }
      });
      Games.update(gameid, {$set: {"gameState": "Done", "timestamps.done" : new Date()}});
      botActions(game._id);
    }
  }

  // TODO: probably should somehow call this automatically on state transitions
  function botActions(gameid) {
    var game = Games.findOne(gameid);
    GamePlayers.find({gameid:game._id, bot:true}).forEach(function (gamePlayer) {
      if (game.gameState === "Night") {
        if (!gamePlayer.myinfo.night_done) {
          if (gamePlayer.myinfo.orig_role === "Robber") {
            if (Math.random()<0.25) {
              Meteor.call("robberNightSubmit", game, gamePlayer.userid, "nobody");
            } else {
              target = pickRandomOtherGamePlayer(game, gamePlayer, 1);
              Meteor.call("robberNightSubmit", game, gamePlayer.userid, target._id);
            }
          } else if (gamePlayer.myinfo.orig_role === "Seer") {
            if (Math.random()<0.5) {
              Meteor.call("seerNightSubmit", game, gamePlayer.userid, "middle");
            } else {
              target = pickRandomOtherGamePlayer(game, gamePlayer, 1);
              Meteor.call("seerNightSubmit", game, gamePlayer.userid, target._id);
            }
          } else if (gamePlayer.myinfo.orig_role === "Troublemaker") {
            if (Math.random()<0.25) {
              Meteor.call("troubleNightSubmit", game, gamePlayer.userid, "nobody");
            } else {
              target = pickRandomOtherGamePlayer(game, gamePlayer, 2);
              Meteor.call("troubleNightSubmit", game, gamePlayer.userid, target[0]._id);
              Meteor.call("troubleNightSubmit", game, gamePlayer.userid, target[1]._id);
            }
          } else {
            Meteor.call("dummyNightSubmit", game, gamePlayer.userid);
          }
        }
      } else if (game.gameState === "Day") {
        if (!gamePlayer.myinfo.voted_for) {
          var str;
          if (gamePlayer.myinfo.orig_role === "Werewolf") {
            if (Math.random() < 0.5) {
              str = {"TAPi18n":"claimT", "opts":{"myRole":{"TAPi18n":"Villager"}, "note":{"TAPi18n":"nr_v"}}};
            } else {
              str = {"TAPi18n":"claimT", "opts":{"myRole":{"TAPi18n":"Robber"}, "note":{"TAPi18n":"Did not rob"}}};
            }
          } else if (gamePlayer.myinfo.orig_role === "Robber" && gamePlayer.myinfo.night_result === "Werewolf") {
            if (Math.random() < 0.5) {
              str = {"TAPi18n":"claimT", "opts":{"myRole":{"TAPi18n":"Villager"}, "note":{"TAPi18n":"nr_v"}}};
            } else {
              str = {"TAPi18n":"claimT", "opts":{"myRole":{"TAPi18n":"Robber"}, "note":{"TAPi18n":"Did not rob"}}};
            }
          } else {
            str = {"TAPi18n":"claimT", "opts":{"myRole":{"TAPi18n":gamePlayer.myinfo.orig_role}, "note":nightResult(game._id, gamePlayer._id)}};
          }
          Messages.insert({
            "gameid" : gameid,
            "userid" : gamePlayer.userid,
            "username" : gamePlayer.username,
            "creation_date" : new Date(),
            "content"  : str
          });
          target = pickRandomOtherGamePlayer(game, gamePlayer, 1);
          Meteor.call("voteSubmit", game, gamePlayer.userid, target._id);
        }
      }
    });
  }

  function pickRandomOtherGamePlayer(game, gamePlayer, num) {
    var others = GamePlayers.find({gameid:game._id, userid:{$ne:gamePlayer.userid}}).fetch();
    var count = others.length;
    if (num===1) {
      var pick = Math.floor((Math.random()*count));  // random number between 0 and count-1
      return others[pick];
    } else {
      shuffleArray(others);
      return others.slice(0,num);
    }
  }

  Meteor.methods({
    addGame: function () {
      if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
      var gameId = Games.insert(new Game(Meteor.user()));
      Meteor.call("joinGame", gameId);
    },
    deleteGame: function (gameId) {
      var game = Games.findOne(gameId);
      if (game.ownerid !== Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
      Games.remove(gameId);
    },
    joinGame: function (gameId, options) {
      options = options || {};
      var game = Games.findOne(gameId);
      if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
      if (game.gameState !== "Creating") {
        throw new Meteor.Error("Error: Cannot join game in progress");
        return;
      }
      if (options.bot) {
        var success = false;  // TODO: Find better way to abort the loop
        Meteor.users.find({bot:true}).forEach(function (bot) {
          if (!success && !GamePlayers.findOne({gameid:gameId, userid:bot._id})) {
            GamePlayers.insert(new GamePlayer(gameId, bot));
            success = true;
          }
        });
      } else {
        GamePlayers.insert(new GamePlayer(gameId, Meteor.user()));
      }
    },
    leaveGame: function (gameId, options) {
      options = options || {};
      var gamePlayerId = GamePlayers.findOne({gameid:gameId, userid:Meteor.userId()});
      var game = Games.findOne(gameId);
      if (game.gameState !== "Creating") {
        throw new Meteor.Error("Error: Cannot join game in progress");
        return;
      }
      if (options.bot) {
        var bot = GamePlayers.findOne({gameid:game._id, bot:true});
        if (bot) {
          GamePlayers.remove(bot._id);
        } else {
          throw new Meteor.Error("Error: no bots to remove");
        }
      } else {
        GamePlayers.remove(gamePlayerId);
      }
    },
    addRole: function (gameId, role) {
      if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
      GameRoles.insert({gameid:gameId, roleid:role._id, name:role.name, order:role.order});
    },
    deleteRole: function (role) {
      var game = Games.findOne(role.gameid);
      if (game.ownerid !== Meteor.userId()) {
        throw new Meteor.Error("Error: Only owner can do this", game.ownerid, Meteor.userId());
        return;
      }
      if (game.gameState !== "Creating") {
        throw new Meteor.Error("Error: Can only delete roles while creating", game.ownerid, Meteor.userId());
        return;
      }
      if (!Meteor.userId()) { throw new Meteor.Error("not-authorized"); }
      GameRoles.remove(role._id);
    },
    resetGame: function(game) {
      if (game.ownerid !== Meteor.userId()) {
        throw new Meteor.Error("Error: Only owner can do this", game.ownerid, Meteor.userId());
        return;
      }
      // Reset game state
      Games.update({_id:game._id}, {$set: {"gameState": "Creating"}});
      Games.update({_id:game._id}, {$set: {"myinfo.orig_werewolves": []}});
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        user = Meteor.users.findOne(gamePlayer.userid);
        GamePlayers.update({_id:gamePlayer._id}, new GamePlayer(game._id, Meteor.users.findOne(gamePlayer.userid)));
      });
    },
    startGame: function(game) {
      // TODO: Fix minimum code
      // TODO: Better error display
      if (game.ownerid !== Meteor.userId()) {
        throw new Meteor.Error("Error: Only owner can do this", game.ownerid, Meteor.userId());
        return;
      }
      if (GamePlayers.find({gameid:game._id}).count() < 2) {
        throw new Meteor.Error("Error: Must have at least 2 players");
        return
      }
      if (GameRoles.find({gameid:game._id}).count() !== GamePlayers.find({gameid:game._id}).count() + 3) {
        throw new Meteor.Error("Error: Must have 3 more roles than players");
        return
      }

      // Reset game state
      Meteor.call("resetGame", game);

      // Assign roles
      var unusedRoles = GameRoles.find({gameid:game._id}).fetch();
      if (!game.myinfo.no_shuffle) {
        shuffleArray(unusedRoles);
      }
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        var role = unusedRoles.pop();
        GamePlayers.update({_id:gamePlayer._id}, {$set: { "myinfo.curr_role": role.name, "myinfo.orig_role": role.name }});
        if (role.name === "Werewolf") {
          Games.update({_id:game._id}, {$push: {"myinfo.orig_werewolves": {userid:gamePlayer.userid, username:gamePlayer.username}}});
        }
      });
      Games.update({_id:game._id}, {$set: {"myinfo.unused_roles": unusedRoles}});

      // Night logic for roles that we can execute immediately
      var game = Games.findOne(game._id);
      var orig_werewolves = game.myinfo.orig_werewolves;
      GamePlayers.find({gameid:game._id}).forEach(function (gamePlayer) {
        if (gamePlayer.myinfo.orig_role === "Werewolf") {
          if (orig_werewolves.length === 1) {
            var pick = Math.floor((Math.random()*3));  // random number between 0 and 2
            var centerPeek = game.myinfo.unused_roles[pick].name;
            GamePlayers.update({_id:gamePlayer._id}, {$set: {"myinfo.night_targets": [pick]}});
          }
        }
      });

      // Change state to night
      Games.update({_id:game._id}, {$set: {"gameState": "Night", "timestamps.night" : new Date()}});
      Messages.insert({
        "gameid" : game._id,
        "userid" : null,
        "username" : null,
        "creation_date" : new Date(),
        "content"  : "--------------------"
      });
      Messages.insert({
        "gameid" : game._id,
        "userid" : null,
        "username" : null,
        "creation_date" : new Date(),
        "content"  : {"TAPi18n":"newGameStartChat"}
      });

      // bots make moves
      botActions(game._id);

      // Check if night is already done
      checkNightDone(game._id);
    },
    toggleExample: function(gameid) {
      var game = Games.findOne(gameid);
      Games.update(gameid, {$set: {example_game: !game.example_game}});
    },
    seerNightSubmit: function(game, userid, targetid) {
      var night_targets;
      if (GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.night_done) {
        throw new Meteor.Error("Error: sns Cannot do more than once");
        return;
      }
      if (targetid === "middle") {
        var peeks = shuffleArray([0,1,2]);
        night_targets = [peeks[0], peeks[1]];
      } else {
        night_targets = [targetid];
      }
      GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.night_targets": night_targets,
                                                                   "myinfo.night_done"   : true}});
      checkNightDone(game._id);
    },
    robberNightSubmit: function(game, userid, targetid) {
      if (GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.night_done) {
        throw new Meteor.Error("Error: rns Cannot do more than once");
        return;
      }
      if (targetid === "nobody") {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {
          "myinfo.night_targets": [],
          "myinfo.night_done"   : true}});
      } else {
        // swap robberRole and targetRole
        var robberRole = GamePlayers.findOne({gameid:game._id, userid:userid}).myinfo.curr_role;
        var targetRole = GamePlayers.findOne(targetid).myinfo.curr_role;
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {
          "myinfo.curr_role"    : targetRole,
          "myinfo.night_targets": [targetid],
          "myinfo.night_result" : targetRole,
          "myinfo.night_done"   : true}});
        GamePlayers.update(targetid, {$set: {"myinfo.curr_role" : robberRole}});
      }
      checkNightDone(game._id);
    },
    troubleNightSubmit: function(game, userid, targetid) {
      var gamePlayer = GamePlayers.findOne({gameid:game._id, userid:userid});
      if (gamePlayer.myinfo.night_done) {
        throw new Meteor.Error("Error: tns Cannot do more than once");
        return;
      }
      if (targetid === "nobody") {
        GamePlayers.update(gamePlayer._id, {$set: {
          "myinfo.night_targets": [],
          "myinfo.night_done"   : true}});
      } else {
        if (gamePlayer.myinfo.night_targets.length === 0) {
          GamePlayers.update(gamePlayer._id, {$set: {"myinfo.night_targets": [targetid]}});
        } else if (gamePlayer.myinfo.night_targets.length === 1) {
          GamePlayers.update(gamePlayer._id, {$push: {"myinfo.night_targets": targetid}, $set: {"myinfo.night_done":true}});
        } else {
          throw new Meteor.Error("Error: Inconsistent state");
        }
      }
      checkNightDone(game._id);
    },
    dummyNightSubmit: function(game, userid) {
      GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.night_done" : true}});
      checkNightDone(game._id);
    },
    voteSubmit: function(game, userid, targetid) {
      if (game.gameState !== "Day") {
        throw new Meteor.Error("Error: Can only vote during Day");
        return;
      }
      if (targetid === "nobody") {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.voted_for" : null }});
      } else {
        GamePlayers.update({gameid:game._id, userid:userid}, {$set: {"myinfo.voted_for" : targetid }});
      }
      checkDayDone(game._id);
    },
    addMessage: function(gameid, msg) {
      Messages.insert({
        "gameid" : gameid,
        "userid" : Meteor.userId(),
        "username" : Meteor.user().username,
        "creation_date" : new Date(),
        "content"  : msg
      });
    }
  });
}
